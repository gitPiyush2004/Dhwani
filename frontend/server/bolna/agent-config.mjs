// ---------------------------------------------------------------------------
// The Bolna agent definition: Sarvam for speech-to-text and voice, Gemini as
// the LLM, our booking API as tools, a warm transfer to the clinic's staff
// line, and the post-call webhook. Shapes follow the v2 agent API
// (https://www.bolna.ai/docs/api-reference/agent/v2/create).
// ---------------------------------------------------------------------------

import { buildSystemPrompt, welcomeMessage } from "../agent/prompt.mjs";
import { TOOL_DEFS } from "../agent/tools.mjs";
import { config } from "../config.mjs";
import { toE164 } from "../messaging.mjs";
import { db } from "../state.mjs";

const PRE_CALL = {
  check_slots: "Ek second, main schedule check kar rahi hoon.",
  book_appointment: "Ek second, main appointment book kar rahi hoon.",
  find_appointments: "Ek second, main aapka appointment dhoondh rahi hoon.",
  reschedule_appointment: "Ek second, main time badal rahi hoon.",
  cancel_appointment: "Ek second.",
  get_clinic_info: "Ek second.",
};

const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function buildAgentPayload() {
  const { bolna, publicUrl } = config;
  const clinic = db.clinic ?? {};
  const escalation = toE164(clinic.escalation?.phone);

  const tools = TOOL_DEFS.map((t) => ({
    name: t.name,
    key: "custom_task",
    description: t.description,
    pre_call_message: PRE_CALL[t.name] ?? "Ek second.",
    parameters: t.parameters,
  }));
  const toolsParams = Object.fromEntries(
    TOOL_DEFS.map((t) => [
      t.name,
      {
        method: t.method,
        url: `${publicUrl}/api/bolna/tools/${t.name}`,
        api_token: `Bearer ${bolna.secret}`,
        headers: t.method === "POST" ? { "Content-Type": "application/json" } : {},
        // Only required parameters: Bolna errors on a template key the LLM did not fill.
        param: Object.fromEntries(t.parameters.required.map((k) => [k, `%(${k})s`])),
      },
    ])
  );

  if (escalation) {
    tools.push({
      name: "transfer_to_staff",
      key: "transfer_call",
      description:
        "Transfer the call to clinic staff. Use for emergencies (after telling them to call 108), when the caller asks for a human, or when you cannot help.",
      pre_call_message: "Main aapko clinic staff se connect kar rahi hoon, line par bane rahiye.",
      parameters: {
        type: "object",
        properties: { call_sid: { type: "string", description: "unique call id" } },
        required: ["call_sid"],
      },
    });
    toolsParams.transfer_to_staff = {
      method: "POST",
      url: null,
      param: { call_sid: "%(call_sid)s", call_transfer_number: escalation },
    };
  }

  const keywords = [clinic.name, ...db.doctors.map((d) => d.name.replace(/^Dr\.?\s*/i, "")), "appointment"]
    .filter(Boolean)
    .join(",")
    .slice(0, 900);

  return {
    agent_config: {
      agent_name: `${clinic.name ?? "Clinic"} receptionist`.slice(0, 60),
      agent_welcome_message: welcomeMessage(),
      webhook_url: `${publicUrl}/api/bolna/webhook?token=${encodeURIComponent(bolna.secret)}`,
      call_summary_enabled: true,
      tasks: [
        {
          task_type: "conversation",
          toolchain: { execution: "sequential", pipelines: [["transcriber", "llm", "synthesizer"]] },
          tools_config: {
            llm_agent: {
              agent_type: "simple_llm_agent",
              agent_flow_type: "streaming",
              llm_config: {
                provider: bolna.llmProvider,
                model: bolna.llmModel,
                max_tokens: 400,
                temperature: 0.2,
              },
            },
            synthesizer: {
              provider: "sarvam",
              provider_config: {
                voice: capitalise(bolna.ttsVoice),
                voice_id: bolna.ttsVoice,
                model: bolna.ttsModel,
                language: bolna.language,
                speed: Number(clinic.agent?.speed) || 1,
              },
              stream: true,
              buffer_size: 150,
              audio_format: "wav",
            },
            transcriber: {
              provider: "sarvam",
              model: bolna.sttModel,
              language: bolna.language,
              stream: true,
              endpointing: 500,
              keywords,
              context: `Phone calls to ${clinic.name}, an Indian clinic. Callers book, reschedule or cancel doctor appointments and ask about timings and fees, often in Hinglish.`,
            },
            input: { provider: bolna.telephonyProvider, format: "wav" },
            output: { provider: bolna.telephonyProvider, format: "wav" },
            api_tools: { tools, tools_params: toolsParams },
          },
          task_config: {
            hangup_after_silence: 15,
            call_terminate: 600,
            hangup_after_LLMCall: true,
            call_cancellation_prompt:
              "End the call once the caller's request is complete and they have said goodbye, or after an emergency has been transferred.",
            call_hangup_message: "Dhanyavaad! Aapka din shubh ho.",
            backchanneling: false,
            incremental_delay: 400,
            number_of_words_for_interruption: 2,
            check_if_user_online: true,
            trigger_user_online_message_after: 10,
            voicemail: false,
            inbound_limit: -1,
          },
        },
      ],
    },
    agent_prompts: {
      task_1: { system_prompt: buildSystemPrompt("phone") },
    },
  };
}
