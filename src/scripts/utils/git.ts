import { join } from "path"
import shell from "shelljs"
import semver from "semver"
import fs from "fs-extra"
import gitRawCommits from "git-raw-commits"
import { isPrereleaseVersion } from "./semver"
import { step } from "./common"

export interface ParsedGitTag {
  npmName: string
  version: string
}
export interface ParsedCommit {
  authorEmail: string
  date: string
  commitHash: string
  commitMessage: string
}

const separator = ">>>SEPARATOR<<<"

/**
 * find previous git tag to be compared
 *  - pika@0.0.1-dev.8 compare to pika@0.0.1-dev.7
 *  - pika@0.0.2 compare to pika@0.0.1
 */
export function findPreviousGitTagToBeCompared({
  npmName,
  version
}: {
  npmName: string
  version: string
}): string | undefined {
  let previousGitTagToBeCompared: string | undefined

  const allTagsStr = shell.exec("git tag --sort=-creatordate | head -n 50").stdout
  step({ allTagsStr })
  const filteredTags = semver.rsort(
    allTagsStr
      .split("\n")
      .filter((tag) => tag.startsWith(`${npmName}@`))
      .map((tag) => tag.replace(`${npmName}@`, ""))
  )
  step({ filteredTags })

  const releasingTagIdx = filteredTags.indexOf(version)
  step({ releasingTagIdx })

  if (isPrereleaseVersion(version)) {
    previousGitTagToBeCompared = filteredTags[releasingTagIdx + 1]
  } else {
    previousGitTagToBeCompared = filteredTags.slice(releasingTagIdx + 1).find((v) => !isPrereleaseVersion(v))
  }

  if (!previousGitTagToBeCompared) {
    return undefined
  }
  return `${npmName}@${previousGitTagToBeCompared}`
}

export async function getCommitInRange({
  from,
  to,
  path
}: {
  from: string
  to: string
  path?: string
}): Promise<string> {
  step("getCommitInRange", { from, to, path })
  await fs.mkdirp(join(process.cwd(), "__CHANGELOG__"))
  const rawCommitsFilePath = join(process.cwd(), "__CHANGELOG__", "rawCommits.txt")
  step({ rawCommitsFilePath })

  await fs.createFile(rawCommitsFilePath)
  const rawCommitsFileStream = fs.createWriteStream(rawCommitsFilePath)

  gitRawCommits({
    from,
    to,
    format: `%ae \n %ad \n %H \n %s \n ${separator}`,
    path,
    debug: console.debug
  }).pipe(rawCommitsFileStream)

  await new Promise((resolve, reject) => {
    rawCommitsFileStream.on("finish", () => {
      resolve("")
    })

    rawCommitsFileStream.on("error", (err) => {
      reject(err)
    })
  })

  const rawContent = fs.readFileSync(rawCommitsFilePath, { encoding: "utf-8" }).toString()
  step({ rawContent })

  return rawContent
}

export function parseRawCommits(content: string): ParsedCommit[] {
  if (!content) {
    return []
  }
  const commits = content.split(separator).filter((v) => v !== "\n")
  const res = commits
    .map((commit) =>
      commit
        .split("\n")
        .map((str) => str.trim())
        .filter(Boolean)
    )
    .map((item) => ({
      authorEmail: item[0],
      date: item[1],
      commitHash: item[2],
      commitMessage: item[3].replace(/\(#\d+\)/, "")
    }))

  return res
}

/**
 * pika@0.0.1-dev.8 -> { name: 'pika', version: '0.0.1-dev.8' }
 * @param name
 * @returns
 */
export function parseGitTag(gitTag: string): ParsedGitTag | null {
  const nameVersionRegex = /(.*)@([0-9].*)/

  const matches = gitTag.match(nameVersionRegex)
  if (!matches) {
    return null
  }
  return { npmName: matches[1], version: matches[2] }
}
