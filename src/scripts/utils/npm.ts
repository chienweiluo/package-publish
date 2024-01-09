// @ts-ignore
import execa from "execa"
import { ParsedGitTag, parseGitTag } from "./git"
import { step } from "./common"

/**
 * Execute $ pnpm -r publish and get the output.
 */
export async function runPnpmPublish({ registry }: { registry?: string }) {
  const publishArgs = ["-r", "publish", "--no-git-checks"]
  if (registry) {
    publishArgs.push("--registry", registry)
  }
  const subprocess = execa("pnpm", publishArgs)
  subprocess.stdout?.pipe(process.stdout)
  subprocess.stderr?.pipe(process.stderr)

  const { stdout } = await subprocess
  step(`$ pnpm ${publishArgs.join(" ")}`, { stdout })
  const releasedNPM = getReleasedNPM(stdout)

  if (releasedNPM.length !== 0) {
    step(`[debug] NPM list that have been released successfully.`, releasedNPM)
    /**
     * $ git tag
     */
    while (releasedNPM.length) {
      const npmPackage = releasedNPM.shift()
      const { npmName, version } = npmPackage as ParsedGitTag
      const tag = `${npmName}@${version}`
      await execa("git", ["tag", tag], { stdio: "inherit" })
      step(`\n$ git tag ${tag}\n`)
      /**
       * $ git push origin main --tags
       */
      await execa("git", ["push", "origin", tag], {
        stdio: "inherit"
      })
    }
  }
}

/**
 * Get the package that have been published successfully.
 *
 * input: `
 *   npm notice filename:  @web-studio/universal-uikit@0.4.0.tgz
 *   npm notice filename:  @web-studio/universal-uikit@0.4.0.tgz
 * `
 */
export function getReleasedNPM(input: string): ParsedGitTag[] {
  const npmOutputRegex = /\+ (.*)/g
  const output = []
  let matches

  while ((matches = npmOutputRegex.exec(input))) {
    output.push(matches[1])
  }

  const result = output.map((e) => parseGitTag(e)).filter(Boolean) as ParsedGitTag[]

  return result
}

interface WorkspaceManifest {
  private?: boolean
  name: string
  path: string
}

export async function findTheWorkspacePathByNPMName(npmName: string) {
  const listArgs = ["-r", "list", "--json", "--depth", "0"]
  const { stdout } = await execa("pnpm", listArgs)
  step(`$ pnpm ${listArgs.join(" ")}`)
  const packages: WorkspaceManifest[] = JSON.parse(stdout)
  const packageMap = packages
    .filter((p) => !p.private)
    .reduce((acc, e) => {
      acc[e.name] = e
      return acc
    }, {} as Record<string, WorkspaceManifest>)

  step({ packageMap })
  return packageMap[npmName].path
}
