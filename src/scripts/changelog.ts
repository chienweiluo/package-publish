import { join } from 'path';
import shell from 'shelljs';
import fs from 'fs-extra';
import {
  findPreviousGitTagToBeCompared,
  getCommitInRange,
  parseRawCommits
} from './utils/git';
import { parseGitTag, ParsedCommit } from './utils/git';
import { step } from './utils/common';
import { findTheWorkspacePathByNPMName } from './utils/npm';
import { generateChangelog } from './utils/changelog';

const releaseBranch = "master"

shell.config.fatal = true; // or set('-e');

/* commit category regexp */
const featRegexp = /^feat(?:ure)?/i;
const fixRegexp = /^fix|bugfix/i;
const refactorRegexp = /^refact(?:or)?/;
const perfRegexp = /^perf/;
const miscRegexp = /^revert/i; // github revert commit startWith Revert
const otherRegexp = /^build|ci|chore|docs|test|style/;

async function main(): Promise<void> {
  if (!process.env.CI_COMMIT_TAG) {
    throw new Error(`Missing process.env.CI_COMMIT_TAG`);
  }
  const to = process.env.CI_COMMIT_TAG;

  const parsed = parseGitTag(to);
  if (!parsed) {
    throw new Error(`parseGitTag parse error: ${to}`);
  }
  const { npmName, version } = parsed;
  shell.exec('git fetch --unshallow || true'); // ref: https://stackoverflow.com/questions/6802145/how-to-convert-a-git-shallow-clone-to-a-full-clone
  shell.exec('git fetch --all --tags');
  const from = findPreviousGitTagToBeCompared({ npmName, version });
  if (!from) {
    console.info(`Can't find the any git tag to be compared to=${version}`);
    return;
  }
  step({ npmName, from, to });
  const path = await findTheWorkspacePathByNPMName(npmName);
  const rawContent = await getCommitInRange({ from, to, path });
  step({ rawContent });
  const parsedCommits = parseRawCommits(rawContent);
  step({ parsedCommits });

  const features: ParsedCommit[] = [];
  const bugfixes: ParsedCommit[] = [];
  const refactors: ParsedCommit[] = [];
  const perfs: ParsedCommit[] = [];
  const miscs: ParsedCommit[] = [];
  const internals: ParsedCommit[] = [];

  const regexpMapArrays: [RegExp, ParsedCommit[]][] = [
    [featRegexp, features],
    [fixRegexp, bugfixes],
    [refactorRegexp, refactors],
    [perfRegexp, perfs],
    [miscRegexp, miscs],
    [otherRegexp, internals]
  ];

  // remember to update the index if you update regexpMapArrays
  const otherRegexpIndex = 5;

  parsedCommits.forEach(item => {
    let matched = false;
    for (let i = 0; i < regexpMapArrays.length; i++) {
      if (regexpMapArrays[i][0].test(item.commitMessage)) {
        matched = true;
        regexpMapArrays[i][1].push(item);
        break;
      }
    }
    // no match commit marked it as internals
    if (!matched) {
      regexpMapArrays[otherRegexpIndex][1].push(item);
    }
  });

  const { plainTextVersion, mdVersion } = await generateChangelog({
    features,
    bugfixes,
    refactors,
    perfs,
    miscs,
    internals,
    from,
    to
  });
  step({ plainTextVersion, mdVersion });

  const currentBranch = shell
    .exec('git rev-parse --abbrev-ref HEAD')
    .stdout.trim(); // equals to $ git branch --show-current for git before 2.22

    if (currentBranch !== releaseBranch) {
    // store rawCommit file to avoid the errors
    shell.exec('git stash --include-untracked');
    shell.exec(`git checkout ${releaseBranch}`);
  }

  // 2. For changelog in repo
  const changelogMdFilePath = join(path, 'CHANGELOG.md');
  const originContent = getOriginContent(changelogMdFilePath);

  const newContent = `${mdVersion}${
    originContent ? `\n\n\n${originContent}` : ''
  }`.trimEnd();
  fs.writeFileSync(changelogMdFilePath, newContent, { encoding: 'utf-8' });

  shell.exec(`git add .`);
  shell.exec(`git commit -m "chore(changelog): ${to} [CI SKIP]"`);
  shell.exec(`git pull origin ${releaseBranch} --rebase`);
  shell.exec(`git push origin ${releaseBranch}`);

  shell.exec(`echo changelog job success 🎉`);

}

const getOriginContent = function (path: string) {
  let originContent;
  try {
    originContent = shell.exec(`cat ${path}`).stdout;
  } catch (error) {
    step(`not found ${path}, create new file.`);
    shell.exec(`touch ${path}`);
    originContent = shell.exec(`cat ${path}`).stdout;
  }
  return originContent;
};
main().catch(err => {
  console.error(err);
  process.exit(1);
});
