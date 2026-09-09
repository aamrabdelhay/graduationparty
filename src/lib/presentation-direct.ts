import { getPool } from "@/db";

export async function updatePresentationStateDirect(values: {
  status: "IDLE" | "RUNNING" | "FINISHED";
  currentParticipantId: string | null;
  nextParticipantId: string | null;
  queuePosition: number;
  playbackMode: string;
  isPaused: boolean;
  sequenceVersion: number;
  phaseStartedAt: Date | null;
  childhoodDuration: number;
  smokeDuration: number;
  adultDuration: number;
  nameAnimationDuration: number;
  updatedAt: Date;
}) {
  const result = await getPool().query(
    `UPDATE presentation_state
     SET status = $1,
         current_participant_id = $2,
         next_participant_id = $3,
         queue_position = $4,
         playback_mode = $5,
         is_paused = $6,
         sequence_version = $7,
         phase_started_at = $8,
         childhood_duration = $9,
         smoke_duration = $10,
         adult_duration = $11,
         name_animation_duration = $12,
         updated_at = $13
     WHERE id = $14`,
    [
      values.status,
      values.currentParticipantId,
      values.nextParticipantId,
      values.queuePosition,
      values.playbackMode,
      values.isPaused,
      values.sequenceVersion,
      values.phaseStartedAt,
      values.childhoodDuration,
      values.smokeDuration,
      values.adultDuration,
      values.nameAnimationDuration,
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
