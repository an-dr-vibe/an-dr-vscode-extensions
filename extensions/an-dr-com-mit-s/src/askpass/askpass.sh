#!/bin/sh
# Git invokes GIT_ASKPASS as an executable, so this wrapper exists purely to
# run the compiled helper under the Node binary the extension host is using.
# Git for Windows runs it with its bundled sh, so one script covers every
# supported platform.
"$AN_DR_COMMITS_ASKPASS_NODE" "$AN_DR_COMMITS_ASKPASS_MAIN" "$@"
