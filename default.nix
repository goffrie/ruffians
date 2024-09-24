{ pkgs ? import <nixpkgs> {} }:

pkgs.mkYarnPackage {
  name = "ruffians";
  src = ./.;
  packageJSON = ./package.json;
  yarnLock = ./yarn.lock;
  nativeBuildInputs = [ pkgs.jq ];
  buildPhase = ''
    yarn build --dist-dir $out
  '';
  installPhase = ''
    cp -r deps/ruffians/src/robots.txt $out/
  '';
  doDist = false;
}
