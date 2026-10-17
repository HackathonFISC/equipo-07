from pathlib import Path

from app.contracts import ImageEvidenceSchema
from app.integrations.evidence import analyze_next_image
from app.integrations.models import InboundDraft, InboundMessage
from app.providers import MockLLMProvider, ProviderError
from tests.test_evaluations import details, submit


async def photo_report(system, mime="image/jpeg"):
    key, _ = await submit(system)
    path = Path(system.settings.media_path) / "telegram/photo-0.jpg"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"\xff\xd8\xff fake jpeg")
    async with system.db.sessions.begin() as session:
        session.add(
            InboundDraft(
                id=key,
                channel="telegram",
                conversation_id="7001",
                status="SUBMITTED",
                fields={},
                report_id=key,
            )
        )
        await session.flush()
        stored = {
            "kind": "image",
            "mime_type": mime,
            "status": "STORED",
            "path": "telegram/photo-0.jpg",
        }
        session.add(
            InboundMessage(
                channel="telegram",
                external_id="7001:1",
                conversation_id="7001",
                draft_id=key,
                content_type="image",
                attachments=[stored],
                status="STORED",
            )
        )
    return key


async def test_photo_analysis_is_advisory_and_runs_once(system):
    seen = []

    class Vision(MockLLMProvider):
        is_simulated = False
        vision_model = "vision-test"

        async def describe_image(self, data, mime_type):
            seen.append((data[:3], mime_type))
            return ImageEvidenceSchema(description="Grifo seco en un fregadero", relevant=True)

    key = await photo_report(system)
    await system.work()
    before = (await details(system, key))["proposal"]["priority"]
    assert await analyze_next_image(system.db, system.settings, Vision()) is True
    assert await analyze_next_image(system.db, system.settings, Vision()) is False
    assert seen == [(b"\xff\xd8\xff", "image/jpeg")]
    detail = await details(system, key)
    [item] = detail["evidence"]
    assert item["analysis"] == {
        "status": "DONE",
        "description": "Grifo seco en un fregadero",
        "relevant": True,
        "model": "vision-test",
        "simulated": False,
    }
    # Advisory only: the proposal is untouched.
    assert detail["proposal"]["priority"] == before


async def test_photo_analysis_failure_is_recorded_not_retried(system):
    class Broken(MockLLMProvider):
        async def describe_image(self, data, mime_type):
            raise ProviderError("APITimeoutError")

    key = await photo_report(system)
    assert await analyze_next_image(system.db, system.settings, Broken()) is True
    assert await analyze_next_image(system.db, system.settings, Broken()) is False
    [item] = (await details(system, key))["evidence"]
    assert item["analysis"] == {"status": "ERROR", "error": "ProviderError"}


async def test_mock_never_claims_to_have_seen_the_photo(system):
    key = await photo_report(system)
    assert await analyze_next_image(system.db, system.settings, MockLLMProvider())
    [item] = (await details(system, key))["evidence"]
    assert item["analysis"]["simulated"] is True and item["analysis"]["relevant"] is None
