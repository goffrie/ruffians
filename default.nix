{ pkgs ? import <nixpkgs> {} }:

pkgs.mkYarnPackage {
  name = "ruffians";
  src = ./.;
  packageJSON = ./package.json;
  yarnLock = ./yarn.lock;
  nativeBuildInputs = [ pkgs.jq ];
  buildPhase = ''
    mkdir deps/ruffians/node_modules_2
    ln -s $(realpath node_modules)/{*,.bin} deps/ruffians/node_modules_2/
    rm deps/ruffians/node_modules
    mv deps/ruffians/node_modules_2 deps/ruffians/node_modules

    yarn build
  '';
  installPhase = ''
    mkdir $out
    cp -r deps/ruffians/build/{index.html,favicon*.ico,robots.txt,static} $out/
    for map in deps/ruffians/build/static/js/*.map; do
      jq -c '.sources |= map (sub(".*/node_modules"; "node_modules"))' < $map > $out/static/js/$(basename $map)
    done
  '';
  distPhase = ''
    true
  '';
}
