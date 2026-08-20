import abc
import asyncio
import logging
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


class DeployResult:
    def __init__(self, url: Optional[str] = None, logs: str = "", error: Optional[str] = None) -> None:
        self.url = url
        self.logs = logs
        self.error = error


class BaseDeployTarget(abc.ABC):
    @abc.abstractmethod
    async def deploy(self, *, source_dir: str, project: Dict[str, Any], build: Dict[str, Any], env_vars: Dict[str, str]) -> DeployResult:
        raise NotImplementedError

    @abc.abstractmethod
    async def teardown(self, *, deployment_id: str, project: Dict[str, Any]) -> None:
        raise NotImplementedError


class DockerDeployTarget(BaseDeployTarget):
    async def deploy(self, *, source_dir: str, project: Dict[str, Any], build: Dict[str, Any], env_vars: Dict[str, str]) -> DeployResult:
        try:
            import docker
        except ImportError as exc:
            raise RuntimeError("docker package is required for Docker deployments") from exc

        client = docker.from_env()
        image_tag = f"forge-deploy-{project.get('id', 'local')}:latest"
        logs: list[str] = []

        def _build_log_stream():
            stream = client.api.build(path=source_dir, rm=True, tag=image_tag, decode=True)
            for chunk in stream:
                if "stream" in chunk:
                    line = chunk["stream"]
                    logs.append(line)
                    yield line

        full_build_log = "".join(_build_log_stream())
        await asyncio.sleep(0)

        port = 8000 + (int(hash(f"{project.get('id')}-{build.get('id')}") % 1000))
        client.containers.run(
            image_tag,
            detach=True,
            ports={"80/tcp": port},
            environment=env_vars or {},
            name=f"forge-deploy-{project.get('id', 'local')}",
        )
        await asyncio.sleep(0)
        return DeployResult(url=f"http://localhost:{port}", logs=full_build_log)

    async def teardown(self, *, deployment_id: str, project: Dict[str, Any]) -> None:
        try:
            import docker
            client = docker.from_env()
            name = f"forge-deploy-{project.get('id', deployment_id)}"
            containers = client.containers.list(filters={"name": name})
            for container in containers:
                container.kill()
                container.remove()
        except Exception:
            logger.debug("Docker teardown skipped or failed", exc_info=True)


class KubernetesDeployTarget(BaseDeployTarget):
    def __init__(self, namespace: str = "default", image_tag_prefix: str = "forge-deploy") -> None:
        self.namespace = namespace
        self.image_tag_prefix = image_tag_prefix

    async def deploy(self, *, source_dir: str, project: Dict[str, Any], build: Dict[str, Any], env_vars: Dict[str, str]) -> DeployResult:
        try:
            from kubernetes import client as k8s_client
            from kubernetes import config as k8s_config
        except ImportError as exc:
            raise RuntimeError("kubernetes package is required for Kubernetes deployments") from exc

        try:
            k8s_config.load_incluster_config()
        except Exception:
            try:
                k8s_config.load_kube_config()
            except Exception as exc:
                raise RuntimeError("No Kubernetes config found") from exc

        project_id = project.get("id", "local")
        image = f"{self.image_tag_prefix}-{project_id}:latest"
        app_name = f"forge-deploy-{project_id}"
        port = 8080

        core = k8s_client.CoreV1Api()
        apps = k8s_client.AppsV1Api()

        deployment_manifest = k8s_client.V1Deployment(
            metadata=k8s_client.V1ObjectMeta(name=app_name, labels={"app": app_name}),
            spec=k8s_client.V1DeploymentSpec(
                replicas=1,
                selector=k8s_client.V1LabelSelector(match_labels={"app": app_name}),
                template=k8s_client.V1PodTemplateSpec(
                    metadata=k8s_client.V1ObjectMeta(labels={"app": app_name}),
                    spec=k8s_client.V1PodSpec(
                        containers=[
                            k8s_client.V1Container(
                                name=app_name,
                                image=image,
                                ports=[k8s_client.V1ContainerPort(container_port=port)],
                                env=[k8s_client.V1EnvVar(name=k, value=v) for k, v in (env_vars or {}).items()],
                            )
                        ]
                    ),
                ),
            ),
        )

        service_manifest = k8s_client.V1Service(
            metadata=k8s_client.V1ObjectMeta(name=app_name, labels={"app": app_name}),
            spec=k8s_client.V1ServiceSpec(
                selector={"app": app_name},
                ports=[k8s_client.V1ServicePort(port=80, target_port=port)],
                type="ClusterIP",
            ),
        )

        try:
            await asyncio.to_thread(apps.create_namespaced_deployment, namespace=self.namespace, body=deployment_manifest)
        except k8s_client.rest.ApiException as exc:
            if exc.status == 409:
                await asyncio.to_thread(apps.replace_namespaced_deployment, name=app_name, namespace=self.namespace, body=deployment_manifest)
            else:
                raise

        try:
            await asyncio.to_thread(core.create_namespaced_service, namespace=self.namespace, body=service_manifest)
        except k8s_client.rest.ApiException as exc:
            if exc.status != 409:
                raise

        return DeployResult(url=f"http://{app_name}.{self.namespace}.svc.cluster.local", logs="")

    async def teardown(self, *, deployment_id: str, project: Dict[str, Any]) -> None:
        try:
            from kubernetes import client as k8s_client
            from kubernetes import config as k8s_config
            try:
                k8s_config.load_incluster_config()
            except Exception:
                k8s_config.load_kube_config()

            app_name = f"forge-deploy-{project.get('id', deployment_id)}"
            core = k8s_client.CoreV1Api()
            apps = k8s_client.AppsV1Api()

            for method in (core.delete_namespaced_service, apps.delete_namespaced_deployment):
                try:
                    await asyncio.to_thread(method, name=app_name, namespace=self.namespace)
                except k8s_client.rest.ApiException as exc:
                    if exc.status != 404:
                        raise
        except Exception:
            logger.debug("Kubernetes teardown skipped or failed", exc_info=True)


def get_deploy_target(target_type: str, target_config: Optional[Dict[str, Any]] = None) -> BaseDeployTarget:
    target_config = target_config or {}
    if target_type == "kubernetes":
        return KubernetesDeployTarget(
            namespace=target_config.get("namespace", "default"),
            image_tag_prefix=target_config.get("image_tag_prefix", "forge-deploy"),
        )
    return DockerDeployTarget()
