"""Deterministic pairwise trainer for the production event ranker artifact."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from collections import defaultdict
from pathlib import Path
from typing import Any

FEATURE_SCALE = 1_000_000.0
COEFFICIENT_SCALE = 10_000
EPOCHS = 120
LEARNING_RATE = 0.04
L2 = 0.002


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--dataset",
        default=".ml-dist/event-ranker/training-v1.jsonl",
    )
    parser.add_argument(
        "--output",
        default="src/data/operational-event-ranker-artifact-v1.json",
    )
    return parser.parse_args()


def load_dataset(path: Path) -> tuple[dict[str, Any], list[dict[str, Any]], str]:
    raw = path.read_bytes()
    lines = raw.decode("utf-8").splitlines()
    if len(lines) < 2:
        raise ValueError("training dataset is empty")
    header = json.loads(lines[0])
    rows = [json.loads(line) for line in lines[1:] if line]
    if header.get("version") != "operational-event-training-dataset-v1":
        raise ValueError("unsupported dataset version")
    feature_count = len(header["featureNames"])
    if any(len(row.get("values", [])) != feature_count for row in rows):
        raise ValueError("dataset row does not match the frozen feature schema")
    return header, rows, hashlib.sha256(raw).hexdigest()


def grouped(rows: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    result: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        result[str(row["queryId"])].append(row)
    return dict(result)


def pairs(
    queries: dict[str, list[dict[str, Any]]],
) -> list[tuple[list[float], int]]:
    result: list[tuple[list[float], int]] = []
    for query_id in sorted(queries):
        candidates = sorted(
            queries[query_id],
            key=lambda row: (row["templateId"], row["templateVersion"]),
        )
        for left_index, left in enumerate(candidates):
            for right in candidates[left_index + 1 :]:
                delta_utility = int(left["utility"]) - int(right["utility"])
                if delta_utility == 0:
                    continue
                sign = 1 if delta_utility > 0 else -1
                delta = [
                    sign * (float(a) - float(b)) / FEATURE_SCALE
                    for a, b in zip(left["values"], right["values"], strict=True)
                ]
                result.append((delta, 1))
    return result


def identity_shortcut_mask(feature_names: list[str]) -> list[bool]:
    blocked_prefixes = ("category.", "tier.", "macro.")
    blocked_names = {
        "candidate.positive",
        "candidate.negative",
        "candidate.follow_up",
    }
    return [
        not (name.startswith(blocked_prefixes) or name in blocked_names)
        for name in feature_names
    ]


def monotonic_directions(feature_names: list[str]) -> list[int]:
    positive = {
        "candidate.novelty",
        "candidate.target_severity_interaction",
        "candidate.lesson_risk_relevance",
        "impact.challenge_fit",
        "impact.reasonable_response_count",
        "impact.choice_separation",
    }
    negative = {
        "candidate.recent_template_count",
        "candidate.recent_category_count",
        "candidate.recent_target_count",
        "impact.burn_months",
        "impact.negative_cash_flow_months",
        "impact.recovery_months",
        "impact.uncovered_cost_share",
        "impact.liquidation_share",
        "impact.credit_use_share",
        "impact.bankruptcy_possible",
        "impact.liquidity_stress_interaction",
        "impact.credit_fragility_interaction",
    }
    return [1 if name in positive else -1 if name in negative else 0 for name in feature_names]


def train(
    feature_count: int,
    training_pairs: list[tuple[list[float], int]],
    trainable: list[bool],
    monotonic: list[int],
) -> list[float]:
    weights = [0.0] * feature_count
    if not training_pairs:
        raise ValueError("training split contains no preference pairs")
    for epoch in range(EPOCHS):
        rate = LEARNING_RATE / math.sqrt(1.0 + epoch * 0.08)
        for delta, _label in training_pairs:
            margin = max(-30.0, min(30.0, sum(w * x for w, x in zip(weights, delta))))
            gradient_scale = 1.0 / (1.0 + math.exp(margin))
            for index, value in enumerate(delta):
                if not trainable[index]:
                    continue
                weights[index] += rate * (gradient_scale * value - L2 * weights[index])
        for index, direction in enumerate(monotonic):
            if direction > 0:
                weights[index] = max(0.0, weights[index])
            elif direction < 0:
                weights[index] = min(0.0, weights[index])
    return weights


def score(row: dict[str, Any], weights: list[float]) -> float:
    return sum(
        weight * (float(value) / FEATURE_SCALE)
        for weight, value in zip(weights, row["values"], strict=True)
    )


def validation_metrics(
    queries: dict[str, list[dict[str, Any]]], weights: list[float]
) -> tuple[int, int, int, int]:
    correct = 0
    pair_count = 0
    top_correct = 0
    for query_id in sorted(queries):
        rows = queries[query_id]
        predicted = sorted(
            rows,
            key=lambda row: (-score(row, weights), row["templateId"], row["templateVersion"]),
        )
        oracle = sorted(
            rows,
            key=lambda row: (-int(row["utility"]), row["templateId"], row["templateVersion"]),
        )
        top_correct += int(
            (predicted[0]["templateId"], predicted[0]["templateVersion"])
            == (oracle[0]["templateId"], oracle[0]["templateVersion"])
        )
        for left_index, left in enumerate(rows):
            for right in rows[left_index + 1 :]:
                expected = int(left["utility"]) - int(right["utility"])
                if expected == 0:
                    continue
                actual = score(left, weights) - score(right, weights)
                correct += int((expected > 0 and actual > 0) or (expected < 0 and actual < 0))
                pair_count += 1
    query_count = len(queries)
    return query_count, pair_count, correct, top_correct


def ppm(numerator: int, denominator: int) -> int:
    return 0 if denominator == 0 else round(numerator * 1_000_000 / denominator)


def main() -> None:
    args = parse_args()
    dataset_path = Path(args.dataset)
    output_path = Path(args.output)
    header, rows, dataset_checksum = load_dataset(dataset_path)
    train_rows = [row for row in rows if int(row["group"]["matchedSeed"]) <= 18]
    validation_rows = [row for row in rows if int(row["group"]["matchedSeed"]) > 18]
    train_queries = grouped(train_rows)
    validation_queries = grouped(validation_rows)
    training_pairs = pairs(train_queries)
    weights = train(
        len(header["featureNames"]),
        training_pairs,
        identity_shortcut_mask(header["featureNames"]),
        monotonic_directions(header["featureNames"]),
    )
    query_count, pair_count, correct, top_correct = validation_metrics(
        validation_queries, weights
    )
    coefficients = [round(weight * COEFFICIENT_SCALE) for weight in weights]
    artifact = {
        "version": "operational-event-ranker-v1",
        "featureVersion": "operational-event-features-v1",
        "rewardPolicyVersion": "operational-event-reward-v1",
        "modelKind": "pairwise_linear_int_v1",
        "trainedAt": "2026-07-18T00:00:00.000Z",
        "trainingDatasetChecksum": dataset_checksum,
        "featureNames": header["featureNames"],
        "coefficients": coefficients,
        "intercept": 0,
        "validation": {
            "queryCount": query_count,
            "pairCount": pair_count,
            "pairwiseAccuracyPpm": ppm(correct, pair_count),
            "topOneAgreementPpm": ppm(top_correct, query_count),
        },
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(artifact, indent=2, sort_keys=False) + "\n", encoding="utf-8"
    )
    print(
        json.dumps(
            {
                "output": str(output_path),
                "trainingQueries": len(train_queries),
                "trainingPairs": len(training_pairs),
                "validation": artifact["validation"],
            }
        )
    )


if __name__ == "__main__":
    main()
