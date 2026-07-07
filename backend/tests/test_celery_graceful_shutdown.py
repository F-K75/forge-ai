"""Regression test for BE-005: no code anywhere acknowledged or logged a
Celery worker shutdown -- graceful shutdown relied entirely on Celery's own
default SIGTERM handling (which does the right thing) plus `acks_late=True`
redelivery, with zero visibility into whether a shutdown was ever actually
graceful. Found 2026-07-03.

Fixed by extending the `worker_shutting_down` handler to cancel the build
consumer, giving in-flight tasks a clean window to complete and preventing
new jobs from being accepted during shutdown.
"""

import celery_app


def test_worker_shutting_down_handler_is_registered():
    receivers = [r for r in celery_app.worker_shutting_down.receivers]
    assert len(receivers) > 0


def test_shutdown_handler_cancels_consumer_and_logs(monkeypatch, caplog):
    import logging

    cap = []

    def fake_cancel(queue=None, reply=False):
        cap.append((queue, reply))

    monkeypatch.setattr(celery_app.celery_app.control, "cancel_consumer", fake_cancel)

    with caplog.at_level(logging.INFO, logger="celery_app"):
        celery_app._graceful_shutdown(sig="SIGTERM", how="Warm", exitcode=0)

    assert any("shutting down gracefully" in r.message for r in caplog.records)
    assert cap == [("build", True)]
