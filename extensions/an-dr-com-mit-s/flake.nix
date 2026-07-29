{
  description = "(neo) Git Graph — VS Code extension dev environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      devShells = forAllSystems (pkgs: {
        default = pkgs.mkShell {
          name = "neo-git-graph";

          packages = with pkgs; [
            # Matches the node version used by .devcontainer/Dockerfile
            nodejs_22

            # The locked nixpkgs currently ships exactly the pnpm pinned by
            # package.json's "packageManager". If nixpkgs drifts, pnpm >= 10
            # self-installs the pinned version, same as corepack does in the
            # devcontainer.
            pnpm

            # `make _pack` / `make __list`
            vsce

            gnumake
            git
            ripgrep
          ];

          shellHook = ''
            # Project-local binaries (esbuild, tsc, vitest, oxlint, ...) take priority
            export PATH="$PWD/node_modules/.bin:$PATH"

            # Keep globally installed pnpm packages out of $HOME/.npm
            export PNPM_HOME="''${XDG_DATA_HOME:-$HOME/.local/share}/pnpm"
            export PATH="$PNPM_HOME:$PATH"

            export GIT_EDITOR="''${GIT_EDITOR:-vim}"

            echo "neo-git-graph dev shell — node $(node --version), pnpm $(pnpm --version)"
            echo "run 'pnpm install' if node_modules/ is missing"
          '';
        };
      });

      formatter = forAllSystems (pkgs: pkgs.nixpkgs-fmt);
    };
}
