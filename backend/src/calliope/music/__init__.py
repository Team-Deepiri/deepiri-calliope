"""Deterministic music analysis and structure helpers (Calliope music brain)."""

from calliope.music.brief_analysis import BriefAnalysis, analyze_brief_text
from calliope.music.structure_engine import ProductionStructure, plan_structure

__all__ = [
    "BriefAnalysis",
    "ProductionStructure",
    "analyze_brief_text",
    "plan_structure",
]
