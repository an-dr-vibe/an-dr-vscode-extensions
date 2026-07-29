/** Builds Git environment values without persisting credentials or editor text. */
export function createGitEnvironment(askPassPath?: string, editorPath?: string): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  if (askPassPath) {
    environment.GIT_ASKPASS = askPassPath;
  }
  if (editorPath) {
    environment.GIT_EDITOR = editorPath;
  }
  return environment;
}
