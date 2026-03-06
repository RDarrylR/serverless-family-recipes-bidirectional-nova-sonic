"""WebSocket server bridging browser audio to Strands BidiAgent and Nova Sonic.

Provides a FastAPI WebSocket endpoint that accepts audio from a browser
(via Web Audio API with echo cancellation) and relays it to a BidiAgent
using Nova Sonic v2 for speech-to-speech processing.

Uses the same pattern as the official AWS sample: raw WebSocket functions
are passed directly to BidiAgent.run(), which handles all event
serialization/deserialization internally.

Run with: cd src && uv run python -m uvicorn server:app --host 0.0.0.0 --port 8000 --reload
"""

import json
import logging
import os
import time

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from strands.experimental.bidi import BidiAgent
from strands.experimental.bidi.models import BidiNovaSonicModel
from strands.experimental.bidi.tools import stop_conversation

from config import AWS_REGION, CLOUDFRONT_ORIGIN, NOVA_SONIC_VOICE, SYSTEM_PROMPT
from tools import convert_units, nutrition_lookup, search_recipes, set_timer

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# Suppress /ping health check spam from uvicorn access logs unless DEBUG
if not logging.getLogger().isEnabledFor(logging.DEBUG):

    class _PingFilter(logging.Filter):
        def filter(self, record: logging.LogRecord) -> bool:
            return "GET /ping" not in record.getMessage()

    logging.getLogger("uvicorn.access").addFilter(_PingFilter())

# Browser captures at 16kHz (voice-optimized), Nova Sonic outputs at 24kHz
BROWSER_INPUT_RATE = 16000
BROWSER_OUTPUT_RATE = 24000

# Nova Sonic pricing (us-east-1, per 1,000 tokens, as of March 2026)
# Audio converts at ~25 tokens/second. Text tokens apply to tool calls.
SPEECH_INPUT_PRICE_PER_1K = 0.0034
SPEECH_OUTPUT_PRICE_PER_1K = 0.0136
TOKENS_PER_SECOND_AUDIO = 25

app = FastAPI(title="Family Recipe Assistant Voice Server")

# Build CORS origins: always allow local dev, add CloudFront if configured
_cors_origins = ["http://localhost:5173"]
if CLOUDFRONT_ORIGIN:
    _cors_origins.append(f"https://{CLOUDFRONT_ORIGIN}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["GET"],
    allow_headers=["content-type"],
)


@app.get("/ping")
async def ping():
    """Health check endpoint required by AgentCore Runtime."""
    return {"status": "ok"}


# Configure Nova Sonic model (shared across connections - stateless)
sonic_model = BidiNovaSonicModel(
    provider_config={
        "audio": {
            "voice": NOVA_SONIC_VOICE,
            "input_rate": BROWSER_INPUT_RATE,
            "output_rate": BROWSER_OUTPUT_RATE,
            "channels": 1,
            "format": "pcm",
        },
        "inference": {},
    },
    client_config={
        "region": AWS_REGION,
    },
)


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    """Handle a browser voice session.

    Creates a new BidiAgent per WebSocket connection and bridges
    browser audio I/O to Nova Sonic via Strands BidiAgent.

    Uses raw WebSocket functions (receive_json/send_json) directly,
    matching the official AWS sample pattern. BidiAgent handles all
    event serialization internally.
    """
    agent = BidiAgent(
        model=sonic_model,
        tools=[
            search_recipes,
            set_timer,
            nutrition_lookup,
            convert_units,
            stop_conversation,
        ],
        system_prompt=SYSTEM_PROMPT,
    )

    # Limit inbound WebSocket message size to 64KB to prevent abuse.
    # Audio chunks from the browser are small (~4KB PCM frames), so this
    # is generous while still capping memory usage per connection.
    MAX_WS_MESSAGE_BYTES = 64 * 1024

    # Track audio chunks for cost estimation
    session_start = time.monotonic()
    input_audio_chunks = 0
    output_audio_chunks = 0

    async def _receive_json_limited():
        nonlocal input_audio_chunks
        data = await ws.receive_json()
        if len(json.dumps(data)) > MAX_WS_MESSAGE_BYTES:
            raise ValueError("WebSocket message too large")
        if isinstance(data, dict) and data.get("type") == "bidi_audio_input":
            input_audio_chunks += 1
        return data

    async def _send_json_tracked(data):
        nonlocal output_audio_chunks
        if isinstance(data, dict) and data.get("type") == "bidi_audio_stream":
            output_audio_chunks += 1
        try:
            await ws.send_json(data)
        except TypeError:
            # BidiAgent may pass non-JSON-serializable events (e.g. BidiModelTimeoutError)
            logger.warning("Skipping non-serializable event: %s", type(data).__name__ if not isinstance(data, dict) else data.get("type"))

    try:
        await ws.accept()
        logger.info("WebSocket connection accepted")

        await agent.run(
            inputs=[_receive_json_limited],
            outputs=[_send_json_tracked],
        )
    except WebSocketDisconnect:
        logger.info("Client disconnected")
    except Exception as e:
        logger.exception("Agent session error: %s", type(e).__name__)
        try:
            await ws.send_json({"type": "error", "message": "An error occurred. Please try again."})
        except Exception:
            pass
    except BaseException as e:
        logger.info("Session ended: %s", type(e).__name__)
    finally:
        session_duration = time.monotonic() - session_start

        # Estimate cost from session duration. Each direction runs continuously
        # for the session length: input = user speaking time, output = agent speaking time.
        # Using wall-clock time as an upper bound for both (user and agent don't
        # speak simultaneously for the full duration, but this gives a ceiling).
        input_tokens = session_duration * TOKENS_PER_SECOND_AUDIO
        output_tokens = session_duration * TOKENS_PER_SECOND_AUDIO
        input_cost = (input_tokens / 1000) * SPEECH_INPUT_PRICE_PER_1K
        output_cost = (output_tokens / 1000) * SPEECH_OUTPUT_PRICE_PER_1K
        estimated_cost = input_cost + output_cost

        logger.info(
            "Session ended: duration=%.1fs, audio_chunks_in=%d, audio_chunks_out=%d, "
            "est_tokens_in=%.0f, est_tokens_out=%.0f, est_cost=$%.4f",
            session_duration,
            input_audio_chunks,
            output_audio_chunks,
            input_tokens,
            output_tokens,
            estimated_cost,
        )

        try:
            await agent.stop()
        except BaseException as cleanup_error:
            logger.debug("Cleanup error: %s", cleanup_error)
        try:
            await ws.close()
        except BaseException:
            pass


if __name__ == "__main__":
    import uvicorn

    host = "0.0.0.0" if os.environ.get("CONTAINER_ENV") else "127.0.0.1"
    uvicorn.run(app, host=host, port=8080)
