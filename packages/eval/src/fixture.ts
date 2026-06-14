import { z } from "zod";

/**
 * A labelled evaluation fixture: one agent action plus the candidate kernel
 * events observed around it, each hand-labelled `true_match` (did this action
 * truly cause this event?). This is the answer key precision/recall is measured
 * against. Timestamps are ISO strings in the file and parsed to `Date` here.
 */
const actionSchema = z.object({
  action_type: z.string(),
  action_name: z.string().nullable(),
  input_summary: z.string().nullable(),
  started_at: z.coerce.date(),
  ended_at: z.coerce.date(),
  agent_pid: z.number(),
  pod_name: z.string().nullable(),
  // Resolved destination IPs for the action — the harness's deterministic,
  // offline stand-in for the correlator's runtime DNS resolution.
  expected_ips: z.array(z.string()).default([]),
});

const eventSchema = z
  .object({
    id: z.number(),
    event_type: z.string(),
    process_pid: z.number(),
    process_binary: z.string().nullable().default(null),
    function_name: z.string().nullable(),
    event_time: z.coerce.date().nullable(),
    created_at: z.coerce.date().nullish(),
    raw_event: z.record(z.unknown()),
    true_match: z.boolean(),
  })
  .superRefine((event, ctx) => {
    if (!event.created_at && !event.event_time) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "event requires created_at or event_time",
      });
    }
  })
  .transform((event) => {
    const createdAt = event.created_at ?? event.event_time;
    if (createdAt === null) {
      throw new Error("event requires created_at or event_time");
    }
    return { ...event, created_at: createdAt };
  });

const fixtureSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  action: actionSchema,
  events: z.array(eventSchema).min(1),
});

export type Fixture = z.infer<typeof fixtureSchema>;
export type FixtureEvent = Fixture["events"][number];
export type FixtureAction = Fixture["action"];

/** Parse and validate untrusted fixture data, throwing on any malformed input. */
export const parseFixture = (raw: unknown): Fixture => fixtureSchema.parse(raw);
