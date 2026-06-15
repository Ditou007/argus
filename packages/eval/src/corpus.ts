import { z } from "zod";

/**
 * A multi-action evaluation corpus: one agent session with several actions and a
 * pool of candidate kernel events. Each event's ground truth is which action (if
 * any) truly caused it — `true_action_id` = a real match, `null` = noise the
 * engine should reject, and `uncertain` = a genuinely ambiguous event excluded
 * from precision/recall. This generalizes the single-action {@link Fixture}.
 */
const corpusActionSchema = z.object({
  id: z.string(),
  action_type: z.string(),
  action_name: z.string().nullable(),
  input_summary: z.string().nullable(),
  started_at: z.coerce.date(),
  ended_at: z.coerce.date(),
  agent_pid: z.number(),
  pod_name: z.string().nullable(),
  expected_ips: z.array(z.string()).default([]),
});

const corpusEventSchema = z.object({
  id: z.number(),
  event_type: z.string(),
  process_pid: z.number(),
  process_binary: z.string().nullable().default(null),
  function_name: z.string().nullable(),
  event_time: z.coerce.date().nullable(),
  created_at: z.coerce.date(),
  raw_event: z.record(z.unknown()),
  // Ground truth. A string = the id of the action that truly caused this event;
  // null = noise (no action caused it — the unexplained/false-positive set).
  true_action_id: z.string().nullable(),
  // Genuinely ambiguous events (e.g. overlapping network windows). Excluded from
  // precision/recall so a labelling judgement call never silently skews a metric.
  uncertain: z.boolean().default(false),
});

const corpusSchema = z
  .object({
    name: z.string(),
    description: z.string().optional(),
    source: z.string().optional(),
    pod_name: z.string(),
    agent_pid: z.number(),
    actions: z.array(corpusActionSchema).min(1),
    events: z.array(corpusEventSchema).min(1),
  })
  .superRefine((corpus, ctx) => {
    const actionIds = new Set(corpus.actions.map((a) => a.id));
    for (const event of corpus.events) {
      if (event.true_action_id !== null && !actionIds.has(event.true_action_id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `event ${event.id}: true_action_id "${event.true_action_id}" is not a known action id`,
        });
      }
    }
  });

export type Corpus = z.infer<typeof corpusSchema>;
export type CorpusAction = Corpus["actions"][number];
export type CorpusEvent = Corpus["events"][number];

/** Parse and validate an untrusted corpus, throwing on malformed input or a dangling action id. */
export const parseCorpus = (raw: unknown): Corpus => corpusSchema.parse(raw);

/** The distinct `action_type`s present in the corpus. */
export const actionTypes = (corpus: Corpus): string[] =>
  [...new Set(corpus.actions.map((a) => a.action_type))].sort();
