{ config, pkgs, ... }:
with pkgs.lib;
let
  cfg = config.services.ruffians;
  build = import ./build.nix {};
in {
  options.services.ruffians = {
    listen = mkOption {
      type = types.str;
      example = "127.0.0.1:8080";
      description = "The address on which to listen";
    };
  };
  config.environment.etc."ruffians/client".source = "${build.client}";
  config.systemd.services.ruffians = {
    description = "bau bau";
    after = [ "network.target" ];
    wantedBy = [ "multi-user.target" ];
    environment.RUST_BACKTRACE = "1";
    serviceConfig = {
      ExecStart = "${build.server}/bin/globby ${cfg.listen} /etc/ruffians/client /var/lib/ruffians";
      StandardOutput = "syslog";
      StandardError = "syslog";
      SyslogIdentifier = "ruffians";
      DynamicUser = true;
      ProtectSystem = "strict";
      ProtectHome = true;
      PrivateDevices = true;
      PrivateUsers = true;
      PrivateTmp = true;
      ProtectKernelTunables = true;
      ProtectKernelModules = true;
      ProtectControlGroups = true;
      RestrictAddressFamilies = "AF_INET AF_INET6";
      Restart = "always";
      RestartSec = "5s";
      StateDirectory = "ruffians";
    };
  };
}
