"""Regression test for BE-005: no code anywhere acknowledged or logged a
Celery worker shutdown -- graceful shutdown relied entirely on Celery's own
default SIGTERM handling (which does the right thing) plus `acks_late=True`
redelivery, with zero visibility into whether a shutdown was ever actually
graceful. Found 2026-07-03.

Fixed by registering a `worker_shutting_down` signal handler that logs the
event, and (the part this test can't exercise) giving that warm shutdown
enough time to matter: k8s's `terminationGracePeriodSeconds` and Compose's
`stop_grace_period` were both far shorter than a single build can take
(build_timeout=600s), so a worker was still getting SIGKILLed mid-build
regardless of Celery's own graceful handling.
"""

import pytest

import celery_app


def test_worker_shutting_down_handler_is_registered():
    # celery.signals.worker_shutting_down is itself just a dispatcher;
    # confirm our handler is actually connected to it.
    receivers = [r for r in celery_app.worker_shutting_down.receivers]
    assert len(receivers) > 0


def test_shutdown_handler_logs_the_event(monkeypatch, caplog):
    import logging

    with caplog.at_level(logging.INFO, logger="celery_app"):
        celery_app._log_graceful_shutdown(sig="SIGTERM", how="Warm", exitcode=0)

    assert any("shutting down gracefully" in r.message for r in caplog.records)
    assert any("SIGTERM" in r.message or "Warm" in r.message for r in caplog.records)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
