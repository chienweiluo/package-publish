import shell from 'shelljs';
import { ParsedCommit } from './git';

shell.config.fatal = true; // or set('-e');

const repoCommitUrl = 'https://github.com/chienweiluo/package-publish/commit';
const repoCompareUrl = 'https://github.com/chienweiluo/package-publish/compare';

export async function generateChangelog({
  features,
  bugfixes,
  refactors,
  perfs,
  miscs,
  internals,
  from,
  to
}: {
  features: ParsedCommit[];
  bugfixes: ParsedCommit[];
  refactors: ParsedCommit[];
  perfs: ParsedCommit[];
  miscs: ParsedCommit[];
  internals: ParsedCommit[];
  from: string;
  to: string;
}) {
  const date = shell.exec('date +%F').stdout.replace('\n', '');
  const TITLE = `${to} (${date})`;
  const MD_TITLE = `# [${to}](${repoCompareUrl}/${from}...${to})(${date})`;

  const commitMapTitle: [ParsedCommit[], string][] = [
    [bugfixes, 'Bug Fixes'],
    [features, 'Features'],
    [refactors, 'Refactor'],
    [perfs, 'Performance Improvements'],
    [miscs, 'Misc'],
    [internals.filter(internal => internal.authorEmail !== 'bot'), 'Internal']
  ];
  // we can have different category rule in different repo
  const generatePlaintextBody = () => {
    const BODY: string[] = [];

    commitMapTitle.forEach(([items, title]) => {
      if (items.length > 0) {
        BODY.push(`\n${title}`);

        items.forEach(item => {
          BODY.push(item.commitMessage);
        });
      }
    });

    return BODY;
  };

  const generateMdBody = () => {
    const BODY: string[] = [];

    commitMapTitle.forEach(([items, title]) => {
      if (items.length > 0) {
        BODY.push(`\n### ${title}`);

        items.forEach(item => {
          BODY.push(
            `* ${item.commitMessage}([${item.commitHash.slice(
              0,
              8
            )}](${repoCommitUrl}/${item.commitHash})) by ${item.authorEmail}`
          );
        });
      }
    });

    return BODY;
  };

  const plaintextBody = generatePlaintextBody();
  const mdBody = generateMdBody();

  return {
    plainTextVersion: `${TITLE}\n${plaintextBody.join('\n')}`,
    mdVersion: `${MD_TITLE}\n${mdBody.join('\n')}`
  };
}
