import logging

logger = logging.getLogger(__name__)


def log_synapse_style_banner() -> None:
    logger.info("Calliope stream hub disabled — single-node compose profile")
