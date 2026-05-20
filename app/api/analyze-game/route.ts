import { NextResponse } from "next/server";
import type { CoachReview } from "@/lib/types";

export const runtime = "nodejs";

type EnrichmentPayload = {
  review?: CoachReview;
};

type LlmRewrite = {
  summary?: string;
  whatWentWell?: string[];
  whatToImprove?: string[];
  patterns?: string[];
  trainingPriority?: string;
  issues?: Array<{ explanation?: string; lesson?: string }>;
};

function normalizeRewrite(review: CoachReview, parsed: LlmRewrite, provider: CoachReview["provider"]): CoachReview {
  return {
    ...review,
    provider,
    summary: parsed.summary || review.summary,
    whatWentWell: parsed.whatWentWell?.length ? parsed.whatWentWell.slice(0, 3) : review.whatWentWell,
    whatToImprove: parsed.whatToImprove?.length ? parsed.whatToImprove.slice(0, 3) : review.whatToImprove,
    patterns: parsed.patterns?.length ? parsed.patterns.slice(0, 3) : review.patterns,
    trainingPriority: parsed.trainingPriority || review.trainingPriority,
    issues: review.issues.map((issue, index) => ({
      ...issue,
      explanation: parsed.issues?.[index]?.explanation || issue.explanation,
      lesson: parsed.issues?.[index]?.lesson || issue.lesson,
    })),
  };
}

function compactReviewForLlm(review: CoachReview) {
  return {
    result: review.result,
    playerColor: review.playerColor,
    accuracy: review.accuracy,
    opponentAccuracy: review.opponentAccuracy,
    whiteAccuracy: review.whiteAccuracy,
    blackAccuracy: review.blackAccuracy,
    trainingPriority: review.trainingPriority,
    summary: review.summary,
    whatWentWell: review.whatWentWell,
    whatToImprove: review.whatToImprove,
    patterns: review.patterns,
    issues: review.issues.map((issue) => ({
      moveNumber: issue.moveNumber,
      side: issue.side,
      label: issue.label,
      playedMove: issue.playedMove,
      recommendedMove: issue.recommendedMove,
      swingCentipawns: issue.swingCentipawns,
      expectedScoreLoss: issue.expectedScoreLoss,
      explanation: issue.explanation,
      lesson: issue.lesson,
    })),
  };
}

async function enrichWithAnthropic(review: CoachReview): Promise<CoachReview> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return review;

  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
  const payload = {
    model,
    max_tokens: 1_600,
    temperature: 0.25,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              "You are a precise chess coach. Rewrite the structured review copy to sound clear, concrete, and useful for beginner/intermediate players. Do NOT change any engine facts, move labels, moves, accuracy, centipawns, or expected-score losses. Return only valid JSON with keys summary, whatWentWell, whatToImprove, patterns, trainingPriority, issues. Each issue may contain only explanation and lesson.",
          },
          {
            type: "text",
            text: JSON.stringify(compactReviewForLlm(review)),
          },
        ],
      },
    ],
  };

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) return review;
    const data = (await response.json()) as {
      content?: Array<{ type?: string; text?: string }>;
    };
    const text = data.content?.find((item) => item.type === "text")?.text;
    if (!text) return review;
    return normalizeRewrite(review, JSON.parse(text) as LlmRewrite, "anthropic");
  } catch {
    return review;
  }
}

async function enrichWithOpenAI(review: CoachReview): Promise<CoachReview> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return review;

  const model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.25,
        input: [
          {
            role: "system",
            content:
              "You rewrite chess coaching copy. Never alter engine facts, move labels, moves, accuracy, centipawns, or expected-score losses. Return valid JSON with summary, whatWentWell, whatToImprove, patterns, trainingPriority, issues. Each issue may contain only explanation and lesson.",
          },
          {
            role: "user",
            content: JSON.stringify(compactReviewForLlm(review)),
          },
        ],
      }),
    });

    if (!response.ok) return review;
    const data = (await response.json()) as { output_text?: string };
    if (!data.output_text) return review;
    return normalizeRewrite(review, JSON.parse(data.output_text) as LlmRewrite, "openai");
  } catch {
    return review;
  }
}

function isReviewPayload(value: unknown): value is CoachReview {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CoachReview>;
  return (
    typeof candidate.summary === "string" &&
    typeof candidate.accuracy === "number" &&
    typeof candidate.whiteAccuracy === "number" &&
    typeof candidate.blackAccuracy === "number" &&
    Array.isArray(candidate.issues) &&
    Array.isArray(candidate.reviewedMoves)
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as EnrichmentPayload;
    if (!isReviewPayload(body.review)) {
      return NextResponse.json(
        {
          error:
            "Engine review payload is required. MateMind computes evaluations and classifications in the browser Stockfish pipeline, then this route optionally polishes the coaching text.",
        },
        { status: 400 },
      );
    }

    let review = body.review;
    if (process.env.ANTHROPIC_API_KEY) {
      review = await enrichWithAnthropic(review);
    } else if (process.env.OPENAI_API_KEY) {
      review = await enrichWithOpenAI(review);
    }

    return NextResponse.json({ review });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to polish this engine review.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
