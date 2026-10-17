import json

import httpx
import pytest
from openai import AsyncOpenAI

from app.config import Settings
from app.providers import NvidiaLLMProvider, ProviderError


@pytest.mark.parametrize("model", ["deepseek-ai/deepseek-v4.1-flash", "moonshotai/kimi-k3"])
async def test_nvidia_structured_contracts_and_model(model):
    captured = []
    outputs = [
        {
            "summary": "Sin agua",
            "kind": "OUTAGE",
            "hours_without_water": None,
            "critical_institution": None,
            "flags": [],
        },
        {"match_confidence": "LOW", "matched_incident_id": None, "reasoning": "Sin candidatos"},
        {"explanation": "Revisión requerida según los factores recibidos"},
    ]

    def handle(request):
        captured.append(json.loads(request.content))
        return httpx.Response(
            200,
            json={
                "id": "test",
                "object": "chat.completion",
                "created": 0,
                "model": model,
                "choices": [
                    {
                        "index": 0,
                        "finish_reason": "stop",
                        "message": {"role": "assistant", "content": json.dumps(outputs.pop(0))},
                    }
                ],
            },
        )

    async with AsyncOpenAI(
        api_key="fake-test-key",
        base_url="https://test.invalid/v1",
        http_client=httpx.AsyncClient(transport=httpx.MockTransport(handle)),
    ) as client:
        provider = NvidiaLLMProvider(Settings(_env_file=None, nvidia_model=model), client)
        assert (await provider.extract_report("Sin agua")).kind == "OUTAGE"
        assert (await provider.evaluate_duplicate({}, [])).match_confidence == "LOW"
        assert (await provider.explain_priority_proposal({}, {})).explanation
        assert not provider.is_simulated
    assert all(c["model"] == model for c in captured)
    assert all("response_format" not in c for c in captured)
    assert all("tools" not in c for c in captured)


async def test_explanation_prompt_separates_points_from_hours(system):
    # Regression: gpt-oss-20b explained 26 duration points as "26 horas" for a 24 h report.
    from app.agents import Agents
    from app.providers import MockLLMProvider
    from tests.test_evaluations import submit

    seen = {}

    class Recorder(MockLLMProvider):
        async def explain_priority_proposal(self, incident, priority):
            seen.update(incident=incident, priority=priority)
            return await super().explain_priority_proposal(incident, priority)

    key, _ = await submit(system)
    agents = Agents(system.db, Recorder(), system.settings)
    state = {"execution_id": key}
    for step in (agents.ingest, agents.verify, agents.coordinate):
        state.update(await step(state))
    assert seen["incident"]["hours_without_water"] == 24
    assert seen["priority"]["factors"]["hours"] == [26, 26]

    captured = []

    def handle(request):
        captured.append(json.loads(request.content))
        return httpx.Response(
            200,
            json={
                "id": "t",
                "object": "chat.completion",
                "created": 0,
                "model": "m",
                "choices": [
                    {
                        "index": 0,
                        "finish_reason": "stop",
                        "message": {"role": "assistant", "content": '{"explanation": "ok"}'},
                    }
                ],
            },
        )

    async with AsyncOpenAI(
        api_key="fake-test-key",
        base_url="https://test.invalid/v1",
        http_client=httpx.AsyncClient(transport=httpx.MockTransport(handle)),
    ) as client:
        provider = NvidiaLLMProvider(Settings(_env_file=None), client)
        await provider.explain_priority_proposal(seen["incident"], seen["priority"])
    system_prompt = captured[0]["messages"][0]["content"]
    assert "no horas" in system_prompt and "hours_without_water" in system_prompt
    sent = json.loads(captured[0]["messages"][1]["content"])
    assert sent["incident"]["hours_without_water"] == 24


@pytest.mark.parametrize("fault", ["malformed", "timeout", "http500"])
async def test_nvidia_errors_do_not_fallback_or_leak(fault):
    def handle(request):
        if fault == "timeout":
            raise httpx.ReadTimeout("secret must not leak", request=request)
        if fault == "http500":
            return httpx.Response(500, json={"error": "secret must not leak"})
        return httpx.Response(
            200,
            json={
                "id": "test",
                "object": "chat.completion",
                "created": 0,
                "model": "fake",
                "choices": [
                    {
                        "index": 0,
                        "finish_reason": "stop",
                        "message": {
                            "role": "assistant",
                            "content": '{"invented":"secret must not leak"}',
                        },
                    }
                ],
            },
        )

    async with AsyncOpenAI(
        api_key="fake",
        max_retries=0,
        http_client=httpx.AsyncClient(transport=httpx.MockTransport(handle)),
    ) as client:
        provider = NvidiaLLMProvider(Settings(_env_file=None), client)
        with pytest.raises(ProviderError) as exc:
            await provider.extract_report("Sin agua")
        assert "secret" not in str(exc.value)
