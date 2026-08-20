import sys

import pytest

from core.deploy_targets import (
    BaseDeployTarget,
    DockerDeployTarget,
    KubernetesDeployTarget,
    get_deploy_target,
)


class DummyTarget(BaseDeployTarget):
    async def deploy(self, *, source_dir, project, build, env_vars):
        raise NotImplementedError

    async def teardown(self, *, deployment_id, project):
        raise NotImplementedError


class TestGetDeployTarget:
    def test_docker_default(self):
        target = get_deploy_target("docker")
        assert isinstance(target, DockerDeployTarget)

    def test_kubernetes_default_namespace(self):
        target = get_deploy_target("kubernetes")
        assert isinstance(target, KubernetesDeployTarget)
        assert target.namespace == "default"

    def test_kubernetes_custom_namespace(self):
        target = get_deploy_target(
            "kubernetes",
            {"namespace": "forge", "image_tag_prefix": "app"},
        )
        assert isinstance(target, KubernetesDeployTarget)
        assert target.namespace == "forge"
        assert target.image_tag_prefix == "app"

    def test_unknown_falls_back_to_docker(self):
        target = get_deploy_target("unknown")
        assert isinstance(target, DockerDeployTarget)


class TestDockerDeployTarget:
    def test_deploy_requires_docker_package(self, monkeypatch):
        target = DockerDeployTarget()
        monkeypatch.setitem(sys.modules, "docker", None)

        with pytest.raises(RuntimeError, match="docker package is required"):
            import asyncio
            asyncio.run(
                target.deploy(
                    source_dir="/tmp",
                    project={"id": "p1"},
                    build={"id": "b1"},
                    env_vars={},
                )
            )

    def test_teardown_is_safe_when_docker_missing(self, monkeypatch):
        target = DockerDeployTarget()
        monkeypatch.setitem(sys.modules, "docker", None)

        import asyncio
        asyncio.run(target.teardown(deployment_id="d1", project={"id": "p1"}))


class TestKubernetesDeployTarget:
    def test_deploy_requires_kubernetes_package(self, monkeypatch):
        target = KubernetesDeployTarget()
        monkeypatch.setitem(sys.modules, "kubernetes", None)
        monkeypatch.setitem(sys.modules, "kubernetes.client", None)
        monkeypatch.setitem(sys.modules, "kubernetes.config", None)

        with pytest.raises(RuntimeError, match="kubernetes package is required"):
            import asyncio
            asyncio.run(
                target.deploy(
                    source_dir="/tmp",
                    project={"id": "p1"},
                    build={"id": "b1"},
                    env_vars={},
                )
            )

    def test_teardown_is_safe_when_kubernetes_missing(self, monkeypatch):
        target = KubernetesDeployTarget()
        monkeypatch.setitem(sys.modules, "kubernetes", None)
        monkeypatch.setitem(sys.modules, "kubernetes.client", None)
        monkeypatch.setitem(sys.modules, "kubernetes.config", None)

        import asyncio
        asyncio.run(target.teardown(deployment_id="d1", project={"id": "p1"}))
