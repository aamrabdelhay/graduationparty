import { getPool } from "@/db";

export async function updatePresentationStateDirect(values: {
  status: "IDLE" | "RUNNING" | "FINISHED";
  currentParticipantId: string | null;
  nextParticipantId: string | null;
  queuePosition: number;
  isPaused: boolean;
  sequenceVersion: number;
  phaseStartedAt: Date | null;
  updatedAt: Date;
}) {
  const result = await getPool().query(
    `UPDATE presentation_state
     SET status = $1,
         current_participant_id = $2,
         next_participant_id = $3,
         queue_position = $4,
         is_paused = $5,
         sequence_version = $6,
         phase_started_at = $7,
         updated_at = $8
     WHERE id = $9`,
    [
      values.status,
      values.currentParticipantId,
      values.nextParticipantId,
      values.queuePosition,
      values.isPaused,
      values.sequenceVersion,
      values.phaseStartedAt,
      values.updatedAt,
      1,
    ],
  );

  if (result.rowCount !== 1) {
    throw new Error(
      `presentation_state update affected ${result.rowCount ?? 0} rows`,
    );
  }
}
