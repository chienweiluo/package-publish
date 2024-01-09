export function isPrereleaseVersion(version: string) {
  return /^\d+\.\d+\.\d+-[a-zA-Z]+.*/.test(version)
}
