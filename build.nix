let
  pinnedNixpkgs = (import <nixpkgs> {}).fetchFromGitHub {
    owner = "NixOS";
    repo = "nixpkgs";
    rev = "e0da498ad77ac8909a980f07eff060862417ccf7";
    sha256 = "sha256-evZzmLW7qoHXf76VCepvun1esZDxHfVRFUJtumD7L2M=";
  };
  strawberry = (import <nixpkgs> {}).fetchFromGitHub {
    owner = "goffrie";
    repo = "strawberry";
    rev = "209d11f16ece71c58fc021a333577b7eeafe0874";
    sha256 = "sha256-S1gB2HGChOK1+fk/aReDKcPgSxwr/1fc8D6duGIOrMw=";
  };
in { pkgs ? import pinnedNixpkgs {} }:
let
  client = import ./default.nix { inherit pkgs; };
  server = (import "${strawberry}/build.nix" { inherit pkgs; }).server;
in
{
  inherit client server;
}
