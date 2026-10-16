import { Schema } from "effect"

export class LaunchPlan extends Schema.Class<LaunchPlan>("LaunchPlan")({
  audience: Schema.Literals(["developers", "operators", "platform teams"]),
  channels: Schema.Array(Schema.String),
  launchDate: Schema.String,
  summary: Schema.String,
  keyRisks: Schema.Array(Schema.String)
}) {}
