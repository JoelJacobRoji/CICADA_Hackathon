"""pytest plugin: run the suite exactly as CI sees it - NO .env files, environment variables only.

Used by scripts/check.ps1 ("ci parity" step) so a local pass cannot hide a CI failure (K16).
"""


def pytest_configure(config):
    from aegis_collector import config as col_config
    from saas_api import config as saas_config

    saas_config.Settings.model_config["env_file"] = None
    col_config.CollectorSettings.model_config["env_file"] = None
    saas_config.get_settings.cache_clear()
    col_config.get_settings.cache_clear()
