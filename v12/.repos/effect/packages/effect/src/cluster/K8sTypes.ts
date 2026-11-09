/**
 * Kubernetes resource types used by the cluster helpers.
 *
 * @stability unstable
 * @since 4.0.0
 */
/*
 * This file incorporates declarations from kubernetes-types 1.30.0,
 * generated from the Kubernetes OpenAPI definitions.
 *
 * Source: https://github.com/silverlyra/kubernetes-types/tree/a46eb94629404af98a6758cd843b31816237d7d0
 * Modified: only the transitive closure of `Pod` is included, flattened from
 * core/v1, meta/v1 and api/resource; JSDoc normalized for Effect and
 * `@category` / `@since` tags added.
 * SPDX-License-Identifier: Apache-2.0
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Represents a Persistent Disk resource in AWS.
 *
 * **Details**
 *
 * An AWS EBS disk must exist before mounting to a container. The disk must also be in the same AWS zone as the kubelet. An AWS EBS disk can only be mounted as read/write once. AWS EBS volumes support ownership management and SELinux relabeling.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface AWSElasticBlockStoreVolumeSource {
  /** fsType is the filesystem type of the volume that you want to mount. Tip: Ensure that the filesystem type is supported by the host operating system. Examples: "ext4", "xfs", "ntfs". Implicitly inferred to be "ext4" if unspecified. More info: https://kubernetes.io/docs/concepts/storage/volumes#awselasticblockstore */
  fsType?: string
  /** partition is the partition in the volume that you want to mount. If omitted, the default is to mount by volume name. Examples: For volume /dev/sda1, you specify the partition as "1". Similarly, the volume partition for /dev/sda is "0" (or you can leave the property empty). */
  partition?: number
  /** readOnly value true will force the readOnly setting in VolumeMounts. More info: https://kubernetes.io/docs/concepts/storage/volumes#awselasticblockstore */
  readOnly?: boolean
  /** volumeID is unique ID of the persistent disk resource in AWS (Amazon EBS volume). More info: https://kubernetes.io/docs/concepts/storage/volumes#awselasticblockstore */
  volumeID: string
}

/**
 * Affinity is a group of affinity scheduling rules.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Affinity {
  /** Describes node affinity scheduling rules for the pod. */
  nodeAffinity?: NodeAffinity
  /** Describes pod affinity scheduling rules (e.g. co-locate this pod in the same node, zone, etc. as some other pod(s)). */
  podAffinity?: PodAffinity
  /** Describes pod anti-affinity scheduling rules (e.g. avoid putting this pod in the same node, zone, etc. as some other pod(s)). */
  podAntiAffinity?: PodAntiAffinity
}

/**
 * AppArmorProfile defines a pod or container's AppArmor settings.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface AppArmorProfile {
  /** localhostProfile indicates a profile loaded on the node that should be used. The profile must be preconfigured on the node to work. Must match the loaded name of the profile. Must be set if and only if type is "Localhost". */
  localhostProfile?: string
  /**
   * type indicates which kind of AppArmor profile will be applied. Valid options are:
   *   Localhost - a profile pre-loaded on the node.
   *   RuntimeDefault - the container runtime's default profile.
   *   Unconfined - no AppArmor enforcement.
   */
  type: string
}

/**
 * AzureDisk represents an Azure Data Disk mount on the host and bind mount to the pod.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface AzureDiskVolumeSource {
  /** cachingMode is the Host Caching mode: None, Read Only, Read Write. */
  cachingMode?: string
  /** diskName is the Name of the data disk in the blob storage */
  diskName: string
  /** diskURI is the URI of data disk in the blob storage */
  diskURI: string
  /** fsType is Filesystem type to mount. Must be a filesystem type supported by the host operating system. Ex. "ext4", "xfs", "ntfs". Implicitly inferred to be "ext4" if unspecified. */
  fsType?: string
  /** kind expected values are Shared: multiple blob disks per storage account  Dedicated: single blob disk per storage account  Managed: azure managed data disk (only in managed availability set). defaults to shared */
  kind?: string
  /** readOnly Defaults to false (read/write). ReadOnly here will force the ReadOnly setting in VolumeMounts. */
  readOnly?: boolean
}

/**
 * AzureFile represents an Azure File Service mount on the host and bind mount to the pod.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface AzureFileVolumeSource {
  /** readOnly defaults to false (read/write). ReadOnly here will force the ReadOnly setting in VolumeMounts. */
  readOnly?: boolean
  /** secretName is the  name of secret that contains Azure Storage Account Name and Key */
  secretName: string
  /** shareName is the azure share Name */
  shareName: string
}

/**
 * Represents a source location of a volume to mount, managed by an external CSI driver
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface CSIVolumeSource {
  /** driver is the name of the CSI driver that handles this volume. Consult with your admin for the correct name as registered in the cluster. */
  driver: string
  /** fsType to mount. Ex. "ext4", "xfs", "ntfs". If not provided, the empty value is passed to the associated CSI driver which will determine the default filesystem to apply. */
  fsType?: string
  /** nodePublishSecretRef is a reference to the secret object containing sensitive information to pass to the CSI driver to complete the CSI NodePublishVolume and NodeUnpublishVolume calls. This field is optional, and  may be empty if no secret is required. If the secret object contains more than one secret, all secret references are passed. */
  nodePublishSecretRef?: LocalObjectReference
  /** readOnly specifies a read-only configuration for the volume. Defaults to false (read/write). */
  readOnly?: boolean
  /** volumeAttributes stores driver-specific properties that are passed to the CSI driver. Consult your driver's documentation for supported values. */
  volumeAttributes?: {
    [name: string]: string
  }
}

/**
 * Adds and removes POSIX capabilities from running containers.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Capabilities {
  /** Added capabilities */
  add?: Array<string>
  /** Removed capabilities */
  drop?: Array<string>
}

/**
 * Represents a Ceph Filesystem mount that lasts the lifetime of a pod Cephfs volumes do not support ownership management or SELinux relabeling.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface CephFSVolumeSource {
  /** monitors is Required: Monitors is a collection of Ceph monitors More info: https://examples.k8s.io/volumes/cephfs/README.md#how-to-use-it */
  monitors: Array<string>
  /** path is Optional: Used as the mounted root, rather than the full Ceph tree, default is / */
  path?: string
  /** readOnly is Optional: Defaults to false (read/write). ReadOnly here will force the ReadOnly setting in VolumeMounts. More info: https://examples.k8s.io/volumes/cephfs/README.md#how-to-use-it */
  readOnly?: boolean
  /** secretFile is Optional: SecretFile is the path to key ring for User, default is /etc/ceph/user.secret More info: https://examples.k8s.io/volumes/cephfs/README.md#how-to-use-it */
  secretFile?: string
  /** secretRef is Optional: SecretRef is reference to the authentication secret for User, default is empty. More info: https://examples.k8s.io/volumes/cephfs/README.md#how-to-use-it */
  secretRef?: LocalObjectReference
  /** user is optional: User is the rados user name, default is admin More info: https://examples.k8s.io/volumes/cephfs/README.md#how-to-use-it */
  user?: string
}

/**
 * Represents a cinder volume resource in Openstack. A Cinder volume must exist before mounting to a container. The volume must also be in the same region as the kubelet. Cinder volumes support ownership management and SELinux relabeling.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface CinderVolumeSource {
  /** fsType is the filesystem type to mount. Must be a filesystem type supported by the host operating system. Examples: "ext4", "xfs", "ntfs". Implicitly inferred to be "ext4" if unspecified. More info: https://examples.k8s.io/mysql-cinder-pd/README.md */
  fsType?: string
  /** readOnly defaults to false (read/write). ReadOnly here will force the ReadOnly setting in VolumeMounts. More info: https://examples.k8s.io/mysql-cinder-pd/README.md */
  readOnly?: boolean
  /** secretRef is optional: points to a secret object containing parameters used to connect to OpenStack. */
  secretRef?: LocalObjectReference
  /** volumeID used to identify the volume in cinder. More info: https://examples.k8s.io/mysql-cinder-pd/README.md */
  volumeID: string
}

/**
 * ClaimSource describes a reference to a ResourceClaim.
 *
 * **Details**
 *
 * Exactly one of these fields should be set.  Consumers of this type must treat an empty object as if it has an unknown value.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ClaimSource {
  /** ResourceClaimName is the name of a ResourceClaim object in the same namespace as this pod. */
  resourceClaimName?: string
  /**
   * ResourceClaimTemplateName is the name of a ResourceClaimTemplate object in the same namespace as this pod.
   *
   * **Details**
   *
   * The template will be used to create a new ResourceClaim, which will be bound to this pod. When this pod is deleted, the ResourceClaim will also be deleted. The pod name and resource name, along with a generated component, will be used to form a unique name for the ResourceClaim, which will be recorded in pod.status.resourceClaimStatuses.
   *
   * This field is immutable and no changes will be made to the corresponding ResourceClaim by the control plane after creating the ResourceClaim.
   */
  resourceClaimTemplateName?: string
}

/**
 * ClusterTrustBundleProjection describes how to select a set of ClusterTrustBundle objects and project their contents into the pod filesystem.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ClusterTrustBundleProjection {
  /** Select all ClusterTrustBundles that match this label selector.  Only has effect if signerName is set.  Mutually-exclusive with name.  If unset, interpreted as "match nothing".  If set but empty, interpreted as "match everything". */
  labelSelector?: LabelSelector
  /** Select a single ClusterTrustBundle by object name.  Mutually-exclusive with signerName and labelSelector. */
  name?: string
  /** If true, don't block pod startup if the referenced ClusterTrustBundle(s) aren't available.  If using name, then the named ClusterTrustBundle is allowed not to exist.  If using signerName, then the combination of signerName and labelSelector is allowed to match zero ClusterTrustBundles. */
  optional?: boolean
  /** Relative path from the volume root to write the bundle. */
  path: string
  /** Select all ClusterTrustBundles that match this signer name. Mutually-exclusive with name.  The contents of all selected ClusterTrustBundles will be unified and deduplicated. */
  signerName?: string
}

/**
 * ConfigMapEnvSource selects a ConfigMap to populate the environment variables with.
 *
 * **Details**
 *
 * The contents of the target ConfigMap's Data field will represent the key-value pairs as environment variables.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ConfigMapEnvSource {
  /** Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names */
  name?: string
  /** Specify whether the ConfigMap must be defined */
  optional?: boolean
}

/**
 * Selects a key from a ConfigMap.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ConfigMapKeySelector {
  /** The key to select. */
  key: string
  /** Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names */
  name?: string
  /** Specify whether the ConfigMap or its key must be defined */
  optional?: boolean
}

/**
 * Adapts a ConfigMap into a projected volume.
 *
 * **Details**
 *
 * The contents of the target ConfigMap's Data field will be presented in a projected volume as files using the keys in the Data field as the file names, unless the items element is populated with specific mappings of keys to paths. Note that this is identical to a configmap volume source without the default mode.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ConfigMapProjection {
  /** items if unspecified, each key-value pair in the Data field of the referenced ConfigMap will be projected into the volume as a file whose name is the key and content is the value. If specified, the listed keys will be projected into the specified paths, and unlisted keys will not be present. If a key is specified which is not present in the ConfigMap, the volume setup will error unless it is marked optional. Paths must be relative and may not contain the '..' path or start with '..'. */
  items?: Array<KeyToPath>
  /** Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names */
  name?: string
  /** optional specify whether the ConfigMap or its keys must be defined */
  optional?: boolean
}

/**
 * Adapts a ConfigMap into a volume.
 *
 * **Details**
 *
 * The contents of the target ConfigMap's Data field will be presented in a volume as files using the keys in the Data field as the file names, unless the items element is populated with specific mappings of keys to paths. ConfigMap volumes support ownership management and SELinux relabeling.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ConfigMapVolumeSource {
  /** defaultMode is optional: mode bits used to set permissions on created files by default. Must be an octal value between 0000 and 0777 or a decimal value between 0 and 511. YAML accepts both octal and decimal values, JSON requires decimal values for mode bits. Defaults to 0644. Directories within the path are not affected by this setting. This might be in conflict with other options that affect the file mode, like fsGroup, and the result can be other mode bits set. */
  defaultMode?: number
  /** items if unspecified, each key-value pair in the Data field of the referenced ConfigMap will be projected into the volume as a file whose name is the key and content is the value. If specified, the listed keys will be projected into the specified paths, and unlisted keys will not be present. If a key is specified which is not present in the ConfigMap, the volume setup will error unless it is marked optional. Paths must be relative and may not contain the '..' path or start with '..'. */
  items?: Array<KeyToPath>
  /** Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names */
  name?: string
  /** optional specify whether the ConfigMap or its keys must be defined */
  optional?: boolean
}

/**
 * A single application container that you want to run within a pod.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Container {
  /** Arguments to the entrypoint. The container image's CMD is used if this is not provided. Variable references $(VAR_NAME) are expanded using the container's environment. If a variable cannot be resolved, the reference in the input string will be unchanged. Double $$ are reduced to a single $, which allows for escaping the $(VAR_NAME) syntax: i.e. "$$(VAR_NAME)" will produce the string literal "$(VAR_NAME)". Escaped references will never be expanded, regardless of whether the variable exists or not. Cannot be updated. More info: https://kubernetes.io/docs/tasks/inject-data-application/define-command-argument-container/#running-a-command-in-a-shell */
  args?: Array<string>
  /** Entrypoint array. Not executed within a shell. The container image's ENTRYPOINT is used if this is not provided. Variable references $(VAR_NAME) are expanded using the container's environment. If a variable cannot be resolved, the reference in the input string will be unchanged. Double $$ are reduced to a single $, which allows for escaping the $(VAR_NAME) syntax: i.e. "$$(VAR_NAME)" will produce the string literal "$(VAR_NAME)". Escaped references will never be expanded, regardless of whether the variable exists or not. Cannot be updated. More info: https://kubernetes.io/docs/tasks/inject-data-application/define-command-argument-container/#running-a-command-in-a-shell */
  command?: Array<string>
  /** List of environment variables to set in the container. Cannot be updated. */
  env?: Array<EnvVar>
  /** List of sources to populate environment variables in the container. The keys defined within a source must be a C_IDENTIFIER. All invalid keys will be reported as an event when the container is starting. When a key exists in multiple sources, the value associated with the last source will take precedence. Values defined by an Env with a duplicate key will take precedence. Cannot be updated. */
  envFrom?: Array<EnvFromSource>
  /** Container image name. More info: https://kubernetes.io/docs/concepts/containers/images This field is optional to allow higher level config management to default or override container images in workload controllers like Deployments and StatefulSets. */
  image?: string
  /** Image pull policy. One of Always, Never, IfNotPresent. Defaults to Always if :latest tag is specified, or IfNotPresent otherwise. Cannot be updated. More info: https://kubernetes.io/docs/concepts/containers/images#updating-images */
  imagePullPolicy?: string
  /** Actions that the management system should take in response to container lifecycle events. Cannot be updated. */
  lifecycle?: Lifecycle
  /** Periodic probe of container liveness. Container will be restarted if the probe fails. Cannot be updated. More info: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#container-probes */
  livenessProbe?: Probe
  /** Name of the container specified as a DNS_LABEL. Each container in a pod must have a unique name (DNS_LABEL). Cannot be updated. */
  name: string
  /** List of ports to expose from the container. Not specifying a port here DOES NOT prevent that port from being exposed. Any port which is listening on the default "0.0.0.0" address inside a container will be accessible from the network. Modifying this array with strategic merge patch may corrupt the data. For more information See https://github.com/kubernetes/kubernetes/issues/108255. Cannot be updated. */
  ports?: Array<ContainerPort>
  /** Periodic probe of container service readiness. Container will be removed from service endpoints if the probe fails. Cannot be updated. More info: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#container-probes */
  readinessProbe?: Probe
  /** Resources resize policy for the container. */
  resizePolicy?: Array<ContainerResizePolicy>
  /** Compute Resources required by this container. Cannot be updated. More info: https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/ */
  resources?: ResourceRequirements
  /** RestartPolicy defines the restart behavior of individual containers in a pod. This field may only be set for init containers, and the only allowed value is "Always". For non-init containers or when this field is not specified, the restart behavior is defined by the Pod's restart policy and the container type. Setting the RestartPolicy as "Always" for the init container will have the following effect: this init container will be continually restarted on exit until all regular containers have terminated. Once all regular containers have completed, all init containers with restartPolicy "Always" will be shut down. This lifecycle differs from normal init containers and is often referred to as a "sidecar" container. Although this init container still starts in the init container sequence, it does not wait for the container to complete before proceeding to the next init container. Instead, the next init container starts immediately after this init container is started, or after any startupProbe has successfully completed. */
  restartPolicy?: string
  /** SecurityContext defines the security options the container should be run with. If set, the fields of SecurityContext override the equivalent fields of PodSecurityContext. More info: https://kubernetes.io/docs/tasks/configure-pod-container/security-context/ */
  securityContext?: SecurityContext
  /** StartupProbe indicates that the Pod has successfully initialized. If specified, no other probes are executed until this completes successfully. If this probe fails, the Pod will be restarted, just as if the livenessProbe failed. This can be used to provide different probe parameters at the beginning of a Pod's lifecycle, when it might take a long time to load data or warm a cache, than during steady-state operation. This cannot be updated. More info: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#container-probes */
  startupProbe?: Probe
  /** Whether this container should allocate a buffer for stdin in the container runtime. If this is not set, reads from stdin in the container will always result in EOF. Default is false. */
  stdin?: boolean
  /** Whether the container runtime should close the stdin channel after it has been opened by a single attach. When stdin is true the stdin stream will remain open across multiple attach sessions. If stdinOnce is set to true, stdin is opened on container start, is empty until the first client attaches to stdin, and then remains open and accepts data until the client disconnects, at which time stdin is closed and remains closed until the container is restarted. If this flag is false, a container processes that reads from stdin will never receive an EOF. Default is false */
  stdinOnce?: boolean
  /** Optional: Path at which the file to which the container's termination message will be written is mounted into the container's filesystem. Message written is intended to be brief final status, such as an assertion failure message. Will be truncated by the node if greater than 4096 bytes. The total message length across all containers will be limited to 12kb. Defaults to /dev/termination-log. Cannot be updated. */
  terminationMessagePath?: string
  /** Indicate how the termination message should be populated. File will use the contents of terminationMessagePath to populate the container status message on both success and failure. FallbackToLogsOnError will use the last chunk of container log output if the termination message file is empty and the container exited with an error. The log output is limited to 2048 bytes or 80 lines, whichever is smaller. Defaults to File. Cannot be updated. */
  terminationMessagePolicy?: string
  /** Whether this container should allocate a TTY for itself, also requires 'stdin' to be true. Default is false. */
  tty?: boolean
  /** volumeDevices is the list of block devices to be used by the container. */
  volumeDevices?: Array<VolumeDevice>
  /** Pod volumes to mount into the container's filesystem. Cannot be updated. */
  volumeMounts?: Array<VolumeMount>
  /** Container's working directory. If not specified, the container runtime's default will be used, which might be configured in the container image. Cannot be updated. */
  workingDir?: string
}

/**
 * ContainerPort represents a network port in a single container.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ContainerPort {
  /** Number of port to expose on the pod's IP address. This must be a valid port number, 0 < x < 65536. */
  containerPort: number
  /** What host IP to bind the external port to. */
  hostIP?: string
  /** Number of port to expose on the host. If specified, this must be a valid port number, 0 < x < 65536. If HostNetwork is specified, this must match ContainerPort. Most containers do not need this. */
  hostPort?: number
  /** If specified, this must be an IANA_SVC_NAME and unique within the pod. Each named port in a pod must have a unique name. Name for the port that can be referred to by services. */
  name?: string
  /** Protocol for port. Must be UDP, TCP, or SCTP. Defaults to "TCP". */
  protocol?: string
}

/**
 * ContainerResizePolicy represents resource resize policy for the container.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ContainerResizePolicy {
  /** Name of the resource to which this resource resize policy applies. Supported values: cpu, memory. */
  resourceName: string
  /** Restart policy to apply when specified resource is resized. If not specified, it defaults to NotRequired. */
  restartPolicy: string
}

/**
 * ContainerState holds a possible state of container. Only one of its members may be specified. If none of them is specified, the default one is ContainerStateWaiting.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ContainerState {
  /** Details about a running container */
  running?: ContainerStateRunning
  /** Details about a terminated container */
  terminated?: ContainerStateTerminated
  /** Details about a waiting container */
  waiting?: ContainerStateWaiting
}

/**
 * ContainerStateRunning is a running state of a container.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ContainerStateRunning {
  /** Time at which the container was last (re-)started */
  startedAt?: Time
}

/**
 * ContainerStateTerminated is a terminated state of a container.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ContainerStateTerminated {
  /** Container's ID in the format '<type>://<container_id>' */
  containerID?: string
  /** Exit status from the last termination of the container */
  exitCode: number
  /** Time at which the container last terminated */
  finishedAt?: Time
  /** Message regarding the last termination of the container */
  message?: string
  /** (brief) reason from the last termination of the container */
  reason?: string
  /** Signal from the last termination of the container */
  signal?: number
  /** Time at which previous execution of the container started */
  startedAt?: Time
}

/**
 * ContainerStateWaiting is a waiting state of a container.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ContainerStateWaiting {
  /** Message regarding why the container is not yet running. */
  message?: string
  /** (brief) reason the container is not yet running. */
  reason?: string
}

/**
 * ContainerStatus contains details for the current status of this container.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ContainerStatus {
  /** AllocatedResources represents the compute resources allocated for this container by the node. Kubelet sets this value to Container.Resources.Requests upon successful pod admission and after successfully admitting desired pod resize. */
  allocatedResources?: {
    [name: string]: Quantity
  }
  /** ContainerID is the ID of the container in the format '<type>://<container_id>'. Where type is a container runtime identifier, returned from Version call of CRI API (for example "containerd"). */
  containerID?: string
  /** Image is the name of container image that the container is running. The container image may not match the image used in the PodSpec, as it may have been resolved by the runtime. More info: https://kubernetes.io/docs/concepts/containers/images. */
  image: string
  /** ImageID is the image ID of the container's image. The image ID may not match the image ID of the image used in the PodSpec, as it may have been resolved by the runtime. */
  imageID: string
  /** LastTerminationState holds the last termination state of the container to help debug container crashes and restarts. This field is not populated if the container is still running and RestartCount is 0. */
  lastState?: ContainerState
  /** Name is a DNS_LABEL representing the unique name of the container. Each container in a pod must have a unique name across all container types. Cannot be updated. */
  name: string
  /**
   * Ready specifies whether the container is currently passing its readiness check. The value will change as readiness probes keep executing. If no readiness probes are specified, this field defaults to true once the container is fully started (see Started field).
   *
   * **Details**
   *
   * The value is typically used to determine whether a container is ready to accept traffic.
   */
  ready: boolean
  /** Resources represents the compute resource requests and limits that have been successfully enacted on the running container after it has been started or has been successfully resized. */
  resources?: ResourceRequirements
  /** RestartCount holds the number of times the container has been restarted. Kubelet makes an effort to always increment the value, but there are cases when the state may be lost due to node restarts and then the value may be reset to 0. The value is never negative. */
  restartCount: number
  /** Started indicates whether the container has finished its postStart lifecycle hook and passed its startup probe. Initialized as false, becomes true after startupProbe is considered successful. Resets to false when the container is restarted, or if kubelet loses state temporarily. In both cases, startup probes will run again. Is always true when no startupProbe is defined and container is running and has passed the postStart lifecycle hook. The null value must be treated the same as false. */
  started?: boolean
  /** State holds details about the container's current condition. */
  state?: ContainerState
  /** Status of volume mounts. */
  volumeMounts?: Array<VolumeMountStatus>
}

/**
 * Represents downward API info for projecting into a projected volume. Note that this is identical to a downwardAPI volume source without the default mode.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface DownwardAPIProjection {
  /** Items is a list of DownwardAPIVolume file */
  items?: Array<DownwardAPIVolumeFile>
}

/**
 * DownwardAPIVolumeFile represents information to create the file containing the pod field
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface DownwardAPIVolumeFile {
  /** Required: Selects a field of the pod: only annotations, labels, name, namespace and uid are supported. */
  fieldRef?: ObjectFieldSelector
  /** Optional: mode bits used to set permissions on this file, must be an octal value between 0000 and 0777 or a decimal value between 0 and 511. YAML accepts both octal and decimal values, JSON requires decimal values for mode bits. If not specified, the volume defaultMode will be used. This might be in conflict with other options that affect the file mode, like fsGroup, and the result can be other mode bits set. */
  mode?: number
  /** Required: Path is  the relative path name of the file to be created. Must not be absolute or contain the '..' path. Must be utf-8 encoded. The first item of the relative path must not start with '..' */
  path: string
  /** Selects a resource of the container: only resources limits and requests (limits.cpu, limits.memory, requests.cpu and requests.memory) are currently supported. */
  resourceFieldRef?: ResourceFieldSelector
}

/**
 * DownwardAPIVolumeSource represents a volume containing downward API info. Downward API volumes support ownership management and SELinux relabeling.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface DownwardAPIVolumeSource {
  /** Optional: mode bits to use on created files by default. Must be a Optional: mode bits used to set permissions on created files by default. Must be an octal value between 0000 and 0777 or a decimal value between 0 and 511. YAML accepts both octal and decimal values, JSON requires decimal values for mode bits. Defaults to 0644. Directories within the path are not affected by this setting. This might be in conflict with other options that affect the file mode, like fsGroup, and the result can be other mode bits set. */
  defaultMode?: number
  /** Items is a list of downward API volume file */
  items?: Array<DownwardAPIVolumeFile>
}

/**
 * Represents an empty directory for a pod. Empty directory volumes support ownership management and SELinux relabeling.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface EmptyDirVolumeSource {
  /** medium represents what type of storage medium should back this directory. The default is "" which means to use the node's default medium. Must be an empty string (default) or Memory. More info: https://kubernetes.io/docs/concepts/storage/volumes#emptydir */
  medium?: string
  /** sizeLimit is the total amount of local storage required for this EmptyDir volume. The size limit is also applicable for memory medium. The maximum usage on memory medium EmptyDir would be the minimum value between the SizeLimit specified here and the sum of memory limits of all containers in a pod. The default is nil which means that the limit is undefined. More info: https://kubernetes.io/docs/concepts/storage/volumes#emptydir */
  sizeLimit?: Quantity
}

/**
 * EnvFromSource represents the source of a set of ConfigMaps
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface EnvFromSource {
  /** The ConfigMap to select from */
  configMapRef?: ConfigMapEnvSource
  /** An optional identifier to prepend to each key in the ConfigMap. Must be a C_IDENTIFIER. */
  prefix?: string
  /** The Secret to select from */
  secretRef?: SecretEnvSource
}

/**
 * EnvVar represents an environment variable present in a Container.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface EnvVar {
  /** Name of the environment variable. Must be a C_IDENTIFIER. */
  name: string
  /** Variable references $(VAR_NAME) are expanded using the previously defined environment variables in the container and any service environment variables. If a variable cannot be resolved, the reference in the input string will be unchanged. Double $$ are reduced to a single $, which allows for escaping the $(VAR_NAME) syntax: i.e. "$$(VAR_NAME)" will produce the string literal "$(VAR_NAME)". Escaped references will never be expanded, regardless of whether the variable exists or not. Defaults to "". */
  value?: string
  /** Source for the environment variable's value. Cannot be used if value is not empty. */
  valueFrom?: EnvVarSource
}

/**
 * EnvVarSource represents a source for the value of an EnvVar.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface EnvVarSource {
  /** Selects a key of a ConfigMap. */
  configMapKeyRef?: ConfigMapKeySelector
  /** Selects a field of the pod: supports metadata.name, metadata.namespace, `metadata.labels['<KEY>']`, `metadata.annotations['<KEY>']`, spec.nodeName, spec.serviceAccountName, status.hostIP, status.podIP, status.podIPs. */
  fieldRef?: ObjectFieldSelector
  /** Selects a resource of the container: only resources limits and requests (limits.cpu, limits.memory, limits.ephemeral-storage, requests.cpu, requests.memory and requests.ephemeral-storage) are currently supported. */
  resourceFieldRef?: ResourceFieldSelector
  /** Selects a key of a secret in the pod's namespace */
  secretKeyRef?: SecretKeySelector
}

/**
 * An EphemeralContainer is a temporary container that you may add to an existing Pod for user-initiated activities such as debugging. Ephemeral containers have no resource or scheduling guarantees, and they will not be restarted when they exit or when a Pod is removed or restarted. The kubelet may evict a Pod if an ephemeral container causes the Pod to exceed its resource allocation.
 *
 * **Details**
 *
 * To add an ephemeral container, use the ephemeralcontainers subresource of an existing Pod. Ephemeral containers may not be removed or restarted.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface EphemeralContainer {
  /** Arguments to the entrypoint. The image's CMD is used if this is not provided. Variable references $(VAR_NAME) are expanded using the container's environment. If a variable cannot be resolved, the reference in the input string will be unchanged. Double $$ are reduced to a single $, which allows for escaping the $(VAR_NAME) syntax: i.e. "$$(VAR_NAME)" will produce the string literal "$(VAR_NAME)". Escaped references will never be expanded, regardless of whether the variable exists or not. Cannot be updated. More info: https://kubernetes.io/docs/tasks/inject-data-application/define-command-argument-container/#running-a-command-in-a-shell */
  args?: Array<string>
  /** Entrypoint array. Not executed within a shell. The image's ENTRYPOINT is used if this is not provided. Variable references $(VAR_NAME) are expanded using the container's environment. If a variable cannot be resolved, the reference in the input string will be unchanged. Double $$ are reduced to a single $, which allows for escaping the $(VAR_NAME) syntax: i.e. "$$(VAR_NAME)" will produce the string literal "$(VAR_NAME)". Escaped references will never be expanded, regardless of whether the variable exists or not. Cannot be updated. More info: https://kubernetes.io/docs/tasks/inject-data-application/define-command-argument-container/#running-a-command-in-a-shell */
  command?: Array<string>
  /** List of environment variables to set in the container. Cannot be updated. */
  env?: Array<EnvVar>
  /** List of sources to populate environment variables in the container. The keys defined within a source must be a C_IDENTIFIER. All invalid keys will be reported as an event when the container is starting. When a key exists in multiple sources, the value associated with the last source will take precedence. Values defined by an Env with a duplicate key will take precedence. Cannot be updated. */
  envFrom?: Array<EnvFromSource>
  /** Container image name. More info: https://kubernetes.io/docs/concepts/containers/images */
  image?: string
  /** Image pull policy. One of Always, Never, IfNotPresent. Defaults to Always if :latest tag is specified, or IfNotPresent otherwise. Cannot be updated. More info: https://kubernetes.io/docs/concepts/containers/images#updating-images */
  imagePullPolicy?: string
  /** Lifecycle is not allowed for ephemeral containers. */
  lifecycle?: Lifecycle
  /** Probes are not allowed for ephemeral containers. */
  livenessProbe?: Probe
  /** Name of the ephemeral container specified as a DNS_LABEL. This name must be unique among all containers, init containers and ephemeral containers. */
  name: string
  /** Ports are not allowed for ephemeral containers. */
  ports?: Array<ContainerPort>
  /** Probes are not allowed for ephemeral containers. */
  readinessProbe?: Probe
  /** Resources resize policy for the container. */
  resizePolicy?: Array<ContainerResizePolicy>
  /** Resources are not allowed for ephemeral containers. Ephemeral containers use spare resources already allocated to the pod. */
  resources?: ResourceRequirements
  /** Restart policy for the container to manage the restart behavior of each container within a pod. This may only be set for init containers. You cannot set this field on ephemeral containers. */
  restartPolicy?: string
  /** Optional: SecurityContext defines the security options the ephemeral container should be run with. If set, the fields of SecurityContext override the equivalent fields of PodSecurityContext. */
  securityContext?: SecurityContext
  /** Probes are not allowed for ephemeral containers. */
  startupProbe?: Probe
  /** Whether this container should allocate a buffer for stdin in the container runtime. If this is not set, reads from stdin in the container will always result in EOF. Default is false. */
  stdin?: boolean
  /** Whether the container runtime should close the stdin channel after it has been opened by a single attach. When stdin is true the stdin stream will remain open across multiple attach sessions. If stdinOnce is set to true, stdin is opened on container start, is empty until the first client attaches to stdin, and then remains open and accepts data until the client disconnects, at which time stdin is closed and remains closed until the container is restarted. If this flag is false, a container processes that reads from stdin will never receive an EOF. Default is false */
  stdinOnce?: boolean
  /**
   * If set, the name of the container from PodSpec that this ephemeral container targets. The ephemeral container will be run in the namespaces (IPC, PID, etc) of this container. If not set then the ephemeral container uses the namespaces configured in the Pod spec.
   *
   * **Details**
   *
   * The container runtime must implement support for this feature. If the runtime does not support namespace targeting then the result of setting this field is undefined.
   */
  targetContainerName?: string
  /** Optional: Path at which the file to which the container's termination message will be written is mounted into the container's filesystem. Message written is intended to be brief final status, such as an assertion failure message. Will be truncated by the node if greater than 4096 bytes. The total message length across all containers will be limited to 12kb. Defaults to /dev/termination-log. Cannot be updated. */
  terminationMessagePath?: string
  /** Indicate how the termination message should be populated. File will use the contents of terminationMessagePath to populate the container status message on both success and failure. FallbackToLogsOnError will use the last chunk of container log output if the termination message file is empty and the container exited with an error. The log output is limited to 2048 bytes or 80 lines, whichever is smaller. Defaults to File. Cannot be updated. */
  terminationMessagePolicy?: string
  /** Whether this container should allocate a TTY for itself, also requires 'stdin' to be true. Default is false. */
  tty?: boolean
  /** volumeDevices is the list of block devices to be used by the container. */
  volumeDevices?: Array<VolumeDevice>
  /** Pod volumes to mount into the container's filesystem. Subpath mounts are not allowed for ephemeral containers. Cannot be updated. */
  volumeMounts?: Array<VolumeMount>
  /** Container's working directory. If not specified, the container runtime's default will be used, which might be configured in the container image. Cannot be updated. */
  workingDir?: string
}

/**
 * Represents an ephemeral volume that is handled by a normal storage driver.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface EphemeralVolumeSource {
  /**
   * Will be used to create a stand-alone PVC to provision the volume. The pod in which this EphemeralVolumeSource is embedded will be the owner of the PVC, i.e. the PVC will be deleted together with the pod.  The name of the PVC will be `<pod name>-<volume name>` where `<volume name>` is the name from the `PodSpec.Volumes` array entry. Pod validation will reject the pod if the concatenated name is not valid for a PVC (for example, too long).
   *
   * **Details**
   *
   * An existing PVC with that name that is not owned by the pod will *not* be used for the pod to avoid using an unrelated volume by mistake. Starting the pod is then blocked until the unrelated PVC is removed. If such a pre-created PVC is meant to be used by the pod, the PVC has to updated with an owner reference to the pod once the pod exists. Normally this should not be necessary, but it may be useful when manually reconstructing a broken cluster.
   *
   * This field is read-only and no changes will be made by Kubernetes to the PVC after it has been created.
   *
   * Required, must not be nil.
   */
  volumeClaimTemplate?: PersistentVolumeClaimTemplate
}

/**
 * ExecAction describes a "run in container" action.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ExecAction {
  /** Command is the command line to execute inside the container, the working directory for the command  is root ('/') in the container's filesystem. The command is simply exec'd, it is not run inside a shell, so traditional shell instructions ('|', etc) won't work. To use a shell, you need to explicitly call out to that shell. Exit status of 0 is treated as live/healthy and non-zero is unhealthy. */
  command?: Array<string>
}

/**
 * Represents a Fibre Channel volume. Fibre Channel volumes can only be mounted as read/write once. Fibre Channel volumes support ownership management and SELinux relabeling.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface FCVolumeSource {
  /** fsType is the filesystem type to mount. Must be a filesystem type supported by the host operating system. Ex. "ext4", "xfs", "ntfs". Implicitly inferred to be "ext4" if unspecified. */
  fsType?: string
  /** lun is Optional: FC target lun number */
  lun?: number
  /** readOnly is Optional: Defaults to false (read/write). ReadOnly here will force the ReadOnly setting in VolumeMounts. */
  readOnly?: boolean
  /** targetWWNs is Optional: FC target worldwide names (WWNs) */
  targetWWNs?: Array<string>
  /** wwids Optional: FC volume world wide identifiers (wwids) Either wwids or combination of targetWWNs and lun must be set, but not both simultaneously. */
  wwids?: Array<string>
}

/**
 * FlexVolume represents a generic volume resource that is provisioned/attached using an exec based plugin.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface FlexVolumeSource {
  /** driver is the name of the driver to use for this volume. */
  driver: string
  /** fsType is the filesystem type to mount. Must be a filesystem type supported by the host operating system. Ex. "ext4", "xfs", "ntfs". The default filesystem depends on FlexVolume script. */
  fsType?: string
  /** options is Optional: this field holds extra command options if any. */
  options?: {
    [name: string]: string
  }
  /** readOnly is Optional: defaults to false (read/write). ReadOnly here will force the ReadOnly setting in VolumeMounts. */
  readOnly?: boolean
  /** secretRef is Optional: secretRef is reference to the secret object containing sensitive information to pass to the plugin scripts. This may be empty if no secret object is specified. If the secret object contains more than one secret, all secrets are passed to the plugin scripts. */
  secretRef?: LocalObjectReference
}

/**
 * Represents a Flocker volume mounted by the Flocker agent. One and only one of datasetName and datasetUUID should be set. Flocker volumes do not support ownership management or SELinux relabeling.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface FlockerVolumeSource {
  /** datasetName is Name of the dataset stored as metadata -> name on the dataset for Flocker should be considered as deprecated */
  datasetName?: string
  /** datasetUUID is the UUID of the dataset. This is unique identifier of a Flocker dataset */
  datasetUUID?: string
}

/**
 * Represents a Persistent Disk resource in Google Compute Engine.
 *
 * **Details**
 *
 * A GCE PD must exist before mounting to a container. The disk must also be in the same GCE project and zone as the kubelet. A GCE PD can only be mounted as read/write once or read-only many times. GCE PDs support ownership management and SELinux relabeling.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface GCEPersistentDiskVolumeSource {
  /** fsType is filesystem type of the volume that you want to mount. Tip: Ensure that the filesystem type is supported by the host operating system. Examples: "ext4", "xfs", "ntfs". Implicitly inferred to be "ext4" if unspecified. More info: https://kubernetes.io/docs/concepts/storage/volumes#gcepersistentdisk */
  fsType?: string
  /** partition is the partition in the volume that you want to mount. If omitted, the default is to mount by volume name. Examples: For volume /dev/sda1, you specify the partition as "1". Similarly, the volume partition for /dev/sda is "0" (or you can leave the property empty). More info: https://kubernetes.io/docs/concepts/storage/volumes#gcepersistentdisk */
  partition?: number
  /** pdName is unique name of the PD resource in GCE. Used to identify the disk in GCE. More info: https://kubernetes.io/docs/concepts/storage/volumes#gcepersistentdisk */
  pdName: string
  /** readOnly here will force the ReadOnly setting in VolumeMounts. Defaults to false. More info: https://kubernetes.io/docs/concepts/storage/volumes#gcepersistentdisk */
  readOnly?: boolean
}

/**
 * GRPCAction specifies an action involving a gRPC service.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface GRPCAction {
  /** Port number of the gRPC service. Number must be in the range 1 to 65535. */
  port: number
  /**
   * Service is the name of the service to place in the gRPC HealthCheckRequest (see https://github.com/grpc/grpc/blob/master/doc/health-checking.md).
   *
   * **Details**
   *
   * If this is not specified, the default behavior is defined by gRPC.
   */
  service?: string
}

/**
 * Represents a volume that is populated with the contents of a git repository. Git repo volumes do not support ownership management. Git repo volumes support SELinux relabeling.
 *
 * **Details**
 *
 * DEPRECATED: GitRepo is deprecated. To provision a container with a git repo, mount an EmptyDir into an InitContainer that clones the repo using git, then mount the EmptyDir into the Pod's container.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface GitRepoVolumeSource {
  /** directory is the target directory name. Must not contain or start with '..'.  If '.' is supplied, the volume directory will be the git repository.  Otherwise, if specified, the volume will contain the git repository in the subdirectory with the given name. */
  directory?: string
  /** repository is the URL */
  repository: string
  /** revision is the commit hash for the specified revision. */
  revision?: string
}

/**
 * Represents a Glusterfs mount that lasts the lifetime of a pod. Glusterfs volumes do not support ownership management or SELinux relabeling.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface GlusterfsVolumeSource {
  /** endpoints is the endpoint name that details Glusterfs topology. More info: https://examples.k8s.io/volumes/glusterfs/README.md#create-a-pod */
  endpoints: string
  /** path is the Glusterfs volume path. More info: https://examples.k8s.io/volumes/glusterfs/README.md#create-a-pod */
  path: string
  /** readOnly here will force the Glusterfs volume to be mounted with read-only permissions. Defaults to false. More info: https://examples.k8s.io/volumes/glusterfs/README.md#create-a-pod */
  readOnly?: boolean
}

/**
 * HTTPGetAction describes an action based on HTTP Get requests.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface HTTPGetAction {
  /** Host name to connect to, defaults to the pod IP. You probably want to set "Host" in httpHeaders instead. */
  host?: string
  /** Custom headers to set in the request. HTTP allows repeated headers. */
  httpHeaders?: Array<HTTPHeader>
  /** Path to access on the HTTP server. */
  path?: string
  /** Name or number of the port to access on the container. Number must be in the range 1 to 65535. Name must be an IANA_SVC_NAME. */
  port: number | string
  /** Scheme to use for connecting to the host. Defaults to HTTP. */
  scheme?: string
}

/**
 * HTTPHeader describes a custom header to be used in HTTP probes
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface HTTPHeader {
  /** The header field name. This will be canonicalized upon output, so case-variant names will be understood as the same header. */
  name: string
  /** The header field value */
  value: string
}

/**
 * HostAlias holds the mapping between IP and hostnames that will be injected as an entry in the pod's hosts file.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface HostAlias {
  /** Hostnames for the above IP address. */
  hostnames?: Array<string>
  /** IP address of the host file entry. */
  ip?: string
}

/**
 * HostIP represents a single IP address allocated to the host.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface HostIP {
  /** IP is the IP address assigned to the host */
  ip?: string
}

/**
 * Represents a host path mapped into a pod. Host path volumes do not support ownership management or SELinux relabeling.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface HostPathVolumeSource {
  /** path of the directory on the host. If the path is a symlink, it will follow the link to the real path. More info: https://kubernetes.io/docs/concepts/storage/volumes#hostpath */
  path: string
  /** type for HostPath Volume Defaults to "" More info: https://kubernetes.io/docs/concepts/storage/volumes#hostpath */
  type?: string
}

/**
 * Represents an ISCSI disk. ISCSI volumes can only be mounted as read/write once. ISCSI volumes support ownership management and SELinux relabeling.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ISCSIVolumeSource {
  /** chapAuthDiscovery defines whether support iSCSI Discovery CHAP authentication */
  chapAuthDiscovery?: boolean
  /** chapAuthSession defines whether support iSCSI Session CHAP authentication */
  chapAuthSession?: boolean
  /** fsType is the filesystem type of the volume that you want to mount. Tip: Ensure that the filesystem type is supported by the host operating system. Examples: "ext4", "xfs", "ntfs". Implicitly inferred to be "ext4" if unspecified. More info: https://kubernetes.io/docs/concepts/storage/volumes#iscsi */
  fsType?: string
  /** initiatorName is the custom iSCSI Initiator Name. If initiatorName is specified with iscsiInterface simultaneously, new iSCSI interface <target portal>:<volume name> will be created for the connection. */
  initiatorName?: string
  /** iqn is the target iSCSI Qualified Name. */
  iqn: string
  /** iscsiInterface is the interface Name that uses an iSCSI transport. Defaults to 'default' (tcp). */
  iscsiInterface?: string
  /** lun represents iSCSI Target Lun number. */
  lun: number
  /** portals is the iSCSI Target Portal List. The portal is either an IP or ip_addr:port if the port is other than default (typically TCP ports 860 and 3260). */
  portals?: Array<string>
  /** readOnly here will force the ReadOnly setting in VolumeMounts. Defaults to false. */
  readOnly?: boolean
  /** secretRef is the CHAP Secret for iSCSI target and initiator authentication */
  secretRef?: LocalObjectReference
  /** targetPortal is iSCSI Target Portal. The Portal is either an IP or ip_addr:port if the port is other than default (typically TCP ports 860 and 3260). */
  targetPortal: string
}

/**
 * Maps a string key to a path within a volume.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface KeyToPath {
  /** key is the key to project. */
  key: string
  /** mode is Optional: mode bits used to set permissions on this file. Must be an octal value between 0000 and 0777 or a decimal value between 0 and 511. YAML accepts both octal and decimal values, JSON requires decimal values for mode bits. If not specified, the volume defaultMode will be used. This might be in conflict with other options that affect the file mode, like fsGroup, and the result can be other mode bits set. */
  mode?: number
  /** path is the relative path of the file to map the key to. May not be an absolute path. May not contain the path element '..'. May not start with the string '..'. */
  path: string
}

/**
 * Lifecycle describes actions that the management system should take in response to container lifecycle events. For the PostStart and PreStop lifecycle handlers, management of the container blocks until the action is complete, unless the container process fails, in which case the handler is aborted.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Lifecycle {
  /** PostStart is called immediately after a container is created. If the handler fails, the container is terminated and restarted according to its restart policy. Other management of the container blocks until the hook completes. More info: https://kubernetes.io/docs/concepts/containers/container-lifecycle-hooks/#container-hooks */
  postStart?: LifecycleHandler
  /** PreStop is called immediately before a container is terminated due to an API request or management event such as liveness/startup probe failure, preemption, resource contention, etc. The handler is not called if the container crashes or exits. The Pod's termination grace period countdown begins before the PreStop hook is executed. Regardless of the outcome of the handler, the container will eventually terminate within the Pod's termination grace period (unless delayed by finalizers). Other management of the container blocks until the hook completes or until the termination grace period is reached. More info: https://kubernetes.io/docs/concepts/containers/container-lifecycle-hooks/#container-hooks */
  preStop?: LifecycleHandler
}

/**
 * LifecycleHandler defines a specific action that should be taken in a lifecycle hook. One and only one of the fields, except TCPSocket must be specified.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface LifecycleHandler {
  /** Exec specifies the action to take. */
  exec?: ExecAction
  /** HTTPGet specifies the http request to perform. */
  httpGet?: HTTPGetAction
  /** Sleep represents the duration that the container should sleep before being terminated. */
  sleep?: SleepAction
  /** Deprecated. TCPSocket is NOT supported as a LifecycleHandler and kept for the backward compatibility. There are no validation of this field and lifecycle hooks will fail in runtime when tcp handler is specified. */
  tcpSocket?: TCPSocketAction
}

/**
 * LocalObjectReference contains enough information to let you locate the referenced object inside the same namespace.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface LocalObjectReference {
  /** Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names */
  name?: string
}

/**
 * Represents an NFS mount that lasts the lifetime of a pod. NFS volumes do not support ownership management or SELinux relabeling.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface NFSVolumeSource {
  /** path that is exported by the NFS server. More info: https://kubernetes.io/docs/concepts/storage/volumes#nfs */
  path: string
  /** readOnly here will force the NFS export to be mounted with read-only permissions. Defaults to false. More info: https://kubernetes.io/docs/concepts/storage/volumes#nfs */
  readOnly?: boolean
  /** server is the hostname or IP address of the NFS server. More info: https://kubernetes.io/docs/concepts/storage/volumes#nfs */
  server: string
}

/**
 * Node affinity is a group of node affinity scheduling rules.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface NodeAffinity {
  /** The scheduler will prefer to schedule pods to nodes that satisfy the affinity expressions specified by this field, but it may choose a node that violates one or more of the expressions. The node that is most preferred is the one with the greatest sum of weights, i.e. for each node that meets all of the scheduling requirements (resource request, requiredDuringScheduling affinity expressions, etc.), compute a sum by iterating through the elements of this field and adding "weight" to the sum if the node matches the corresponding matchExpressions; the node(s) with the highest sum are the most preferred. */
  preferredDuringSchedulingIgnoredDuringExecution?: Array<PreferredSchedulingTerm>
  /** If the affinity requirements specified by this field are not met at scheduling time, the pod will not be scheduled onto the node. If the affinity requirements specified by this field cease to be met at some point during pod execution (e.g. due to an update), the system may or may not try to eventually evict the pod from its node. */
  requiredDuringSchedulingIgnoredDuringExecution?: NodeSelector
}

/**
 * A node selector represents the union of the results of one or more label queries over a set of nodes; that is, it represents the OR of the selectors represented by the node selector terms.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface NodeSelector {
  /** Required. A list of node selector terms. The terms are ORed. */
  nodeSelectorTerms: Array<NodeSelectorTerm>
}

/**
 * A node selector requirement is a selector that contains values, a key, and an operator that relates the key and values.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface NodeSelectorRequirement {
  /** The label key that the selector applies to. */
  key: string
  /** Represents a key's relationship to a set of values. Valid operators are In, NotIn, Exists, DoesNotExist. Gt, and Lt. */
  operator: string
  /** An array of string values. If the operator is In or NotIn, the values array must be non-empty. If the operator is Exists or DoesNotExist, the values array must be empty. If the operator is Gt or Lt, the values array must have a single element, which will be interpreted as an integer. This array is replaced during a strategic merge patch. */
  values?: Array<string>
}

/**
 * A null or empty node selector term matches no objects. The requirements of them are ANDed. The TopologySelectorTerm type implements a subset of the NodeSelectorTerm.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface NodeSelectorTerm {
  /** A list of node selector requirements by node's labels. */
  matchExpressions?: Array<NodeSelectorRequirement>
  /** A list of node selector requirements by node's fields. */
  matchFields?: Array<NodeSelectorRequirement>
}

/**
 * ObjectFieldSelector selects an APIVersioned field of an object.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ObjectFieldSelector {
  /** Version of the schema the FieldPath is written in terms of, defaults to "v1". */
  apiVersion?: string
  /** Path of the field to select in the specified API version. */
  fieldPath: string
}

/**
 * PersistentVolumeClaimSpec describes the common attributes of storage devices and allows a Source for provider-specific attributes
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface PersistentVolumeClaimSpec {
  /** accessModes contains the desired access modes the volume should have. More info: https://kubernetes.io/docs/concepts/storage/persistent-volumes#access-modes-1 */
  accessModes?: Array<string>
  /** dataSource field can be used to specify either: * An existing VolumeSnapshot object (snapshot.storage.k8s.io/VolumeSnapshot) * An existing PVC (PersistentVolumeClaim) If the provisioner or an external controller can support the specified data source, it will create a new volume based on the contents of the specified data source. When the AnyVolumeDataSource feature gate is enabled, dataSource contents will be copied to dataSourceRef, and dataSourceRef contents will be copied to dataSource when dataSourceRef.namespace is not specified. If the namespace is specified, then dataSourceRef will not be copied to dataSource. */
  dataSource?: TypedLocalObjectReference
  /**
   * dataSourceRef specifies the object from which to populate the volume with data, if a non-empty volume is desired. This may be any object from a non-empty API group (non core object) or a PersistentVolumeClaim object. When this field is specified, volume binding will only succeed if the type of the specified object matches some installed volume populator or dynamic provisioner. This field will replace the functionality of the dataSource field and as such if both fields are non-empty, they must have the same value. For backwards compatibility, when namespace isn't specified in dataSourceRef, both fields (dataSource and dataSourceRef) will be set to the same value automatically if one of them is empty and the other is non-empty. When namespace is specified in dataSourceRef, dataSource isn't set to the same value and must be empty. There are three important differences between dataSource and dataSourceRef: * While dataSource only allows two specific types of objects, dataSourceRef
   *   allows any non-core object, as well as PersistentVolumeClaim objects.
   * * While dataSource ignores disallowed values (dropping them), dataSourceRef
   *   preserves all values, and generates an error if a disallowed value is
   *   specified.
   * * While dataSource only allows local objects, dataSourceRef allows objects
   *   in any namespaces.
   * (Beta) Using this field requires the AnyVolumeDataSource feature gate to be enabled. (Alpha) Using the namespace field of dataSourceRef requires the CrossNamespaceVolumeDataSource feature gate to be enabled.
   */
  dataSourceRef?: TypedObjectReference
  /** resources represents the minimum resources the volume should have. If RecoverVolumeExpansionFailure feature is enabled users are allowed to specify resource requirements that are lower than previous value but must still be higher than capacity recorded in the status field of the claim. More info: https://kubernetes.io/docs/concepts/storage/persistent-volumes#resources */
  resources?: VolumeResourceRequirements
  /** selector is a label query over volumes to consider for binding. */
  selector?: LabelSelector
  /** storageClassName is the name of the StorageClass required by the claim. More info: https://kubernetes.io/docs/concepts/storage/persistent-volumes#class-1 */
  storageClassName?: string
  /** volumeAttributesClassName may be used to set the VolumeAttributesClass used by this claim. If specified, the CSI driver will create or update the volume with the attributes defined in the corresponding VolumeAttributesClass. This has a different purpose than storageClassName, it can be changed after the claim is created. An empty string value means that no VolumeAttributesClass will be applied to the claim but it's not allowed to reset this field to empty string once it is set. If unspecified and the PersistentVolumeClaim is unbound, the default VolumeAttributesClass will be set by the persistentvolume controller if it exists. If the resource referred to by volumeAttributesClass does not exist, this PersistentVolumeClaim will be set to a Pending state, as reflected by the modifyVolumeStatus field, until such as a resource exists. More info: https://kubernetes.io/docs/concepts/storage/volume-attributes-classes/ (Alpha) Using this field requires the VolumeAttributesClass feature gate to be enabled. */
  volumeAttributesClassName?: string
  /** volumeMode defines what type of volume is required by the claim. Value of Filesystem is implied when not included in claim spec. */
  volumeMode?: string
  /** volumeName is the binding reference to the PersistentVolume backing this claim. */
  volumeName?: string
}

/**
 * PersistentVolumeClaimTemplate is used to produce PersistentVolumeClaim objects as part of an EphemeralVolumeSource.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface PersistentVolumeClaimTemplate {
  /** May contain labels and annotations that will be copied into the PVC when creating it. No other fields are allowed and will be rejected during validation. */
  metadata?: ObjectMeta
  /** The specification for the PersistentVolumeClaim. The entire content is copied unchanged into the PVC that gets created from this template. The same fields as in a PersistentVolumeClaim are also valid here. */
  spec: PersistentVolumeClaimSpec
}

/**
 * PersistentVolumeClaimVolumeSource references the user's PVC in the same namespace. This volume finds the bound PV and mounts that volume for the pod. A PersistentVolumeClaimVolumeSource is, essentially, a wrapper around another type of volume that is owned by someone else (the system).
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface PersistentVolumeClaimVolumeSource {
  /** claimName is the name of a PersistentVolumeClaim in the same namespace as the pod using this volume. More info: https://kubernetes.io/docs/concepts/storage/persistent-volumes#persistentvolumeclaims */
  claimName: string
  /** readOnly Will force the ReadOnly setting in VolumeMounts. Default false. */
  readOnly?: boolean
}

/**
 * Represents a Photon Controller persistent disk resource.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface PhotonPersistentDiskVolumeSource {
  /** fsType is the filesystem type to mount. Must be a filesystem type supported by the host operating system. Ex. "ext4", "xfs", "ntfs". Implicitly inferred to be "ext4" if unspecified. */
  fsType?: string
  /** pdID is the ID that identifies Photon Controller persistent disk */
  pdID: string
}

/**
 * Pod is a collection of containers that can run on a host. This resource is created by clients and scheduled onto hosts.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Pod {
  /** APIVersion defines the versioned schema of this representation of an object. Servers should convert recognized schemas to the latest internal value, and may reject unrecognized values. More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#resources */
  apiVersion?: "v1"
  /** Kind is a string value representing the REST resource this object represents. Servers may infer this from the endpoint the client submits requests to. Cannot be updated. In CamelCase. More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds */
  kind?: "Pod"
  /** Standard object's metadata. More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#metadata */
  metadata?: ObjectMeta
  /** Specification of the desired behavior of the pod. More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#spec-and-status */
  spec?: PodSpec
  /** Most recently observed status of the pod. This data may not be up to date. Populated by the system. Read-only. More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#spec-and-status */
  readonly status?: PodStatus
}

/**
 * Pod affinity is a group of inter pod affinity scheduling rules.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface PodAffinity {
  /** The scheduler will prefer to schedule pods to nodes that satisfy the affinity expressions specified by this field, but it may choose a node that violates one or more of the expressions. The node that is most preferred is the one with the greatest sum of weights, i.e. for each node that meets all of the scheduling requirements (resource request, requiredDuringScheduling affinity expressions, etc.), compute a sum by iterating through the elements of this field and adding "weight" to the sum if the node has pods which matches the corresponding podAffinityTerm; the node(s) with the highest sum are the most preferred. */
  preferredDuringSchedulingIgnoredDuringExecution?: Array<WeightedPodAffinityTerm>
  /** If the affinity requirements specified by this field are not met at scheduling time, the pod will not be scheduled onto the node. If the affinity requirements specified by this field cease to be met at some point during pod execution (e.g. due to a pod label update), the system may or may not try to eventually evict the pod from its node. When there are multiple elements, the lists of nodes corresponding to each podAffinityTerm are intersected, i.e. all terms must be satisfied. */
  requiredDuringSchedulingIgnoredDuringExecution?: Array<PodAffinityTerm>
}

/**
 * Defines a set of pods (namely those matching the labelSelector relative to the given namespace(s)) that this pod should be co-located (affinity) or not co-located (anti-affinity) with, where co-located is defined as running on a node whose value of the label with key <topologyKey> matches that of any node on which a pod of the set of pods is running
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface PodAffinityTerm {
  /** A label query over a set of resources, in this case pods. If it's null, this PodAffinityTerm matches with no Pods. */
  labelSelector?: LabelSelector
  /** MatchLabelKeys is a set of pod label keys to select which pods will be taken into consideration. The keys are used to lookup values from the incoming pod labels, those key-value labels are merged with `labelSelector` as `key in (value)` to select the group of existing pods which pods will be taken into consideration for the incoming pod's pod (anti) affinity. Keys that don't exist in the incoming pod labels will be ignored. The default value is empty. The same key is forbidden to exist in both matchLabelKeys and labelSelector. Also, matchLabelKeys cannot be set when labelSelector isn't set. This is an alpha field and requires enabling MatchLabelKeysInPodAffinity feature gate. */
  matchLabelKeys?: Array<string>
  /** MismatchLabelKeys is a set of pod label keys to select which pods will be taken into consideration. The keys are used to lookup values from the incoming pod labels, those key-value labels are merged with `labelSelector` as `key notin (value)` to select the group of existing pods which pods will be taken into consideration for the incoming pod's pod (anti) affinity. Keys that don't exist in the incoming pod labels will be ignored. The default value is empty. The same key is forbidden to exist in both mismatchLabelKeys and labelSelector. Also, mismatchLabelKeys cannot be set when labelSelector isn't set. This is an alpha field and requires enabling MatchLabelKeysInPodAffinity feature gate. */
  mismatchLabelKeys?: Array<string>
  /** A label query over the set of namespaces that the term applies to. The term is applied to the union of the namespaces selected by this field and the ones listed in the namespaces field. null selector and null or empty namespaces list means "this pod's namespace". An empty selector ({}) matches all namespaces. */
  namespaceSelector?: LabelSelector
  /** namespaces specifies a static list of namespace names that the term applies to. The term is applied to the union of the namespaces listed in this field and the ones selected by namespaceSelector. null or empty namespaces list and null namespaceSelector means "this pod's namespace". */
  namespaces?: Array<string>
  /** This pod should be co-located (affinity) or not co-located (anti-affinity) with the pods matching the labelSelector in the specified namespaces, where co-located is defined as running on a node whose value of the label with key topologyKey matches that of any node on which any of the selected pods is running. Empty topologyKey is not allowed. */
  topologyKey: string
}

/**
 * Pod anti affinity is a group of inter pod anti affinity scheduling rules.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface PodAntiAffinity {
  /** The scheduler will prefer to schedule pods to nodes that satisfy the anti-affinity expressions specified by this field, but it may choose a node that violates one or more of the expressions. The node that is most preferred is the one with the greatest sum of weights, i.e. for each node that meets all of the scheduling requirements (resource request, requiredDuringScheduling anti-affinity expressions, etc.), compute a sum by iterating through the elements of this field and adding "weight" to the sum if the node has pods which matches the corresponding podAffinityTerm; the node(s) with the highest sum are the most preferred. */
  preferredDuringSchedulingIgnoredDuringExecution?: Array<WeightedPodAffinityTerm>
  /** If the anti-affinity requirements specified by this field are not met at scheduling time, the pod will not be scheduled onto the node. If the anti-affinity requirements specified by this field cease to be met at some point during pod execution (e.g. due to a pod label update), the system may or may not try to eventually evict the pod from its node. When there are multiple elements, the lists of nodes corresponding to each podAffinityTerm are intersected, i.e. all terms must be satisfied. */
  requiredDuringSchedulingIgnoredDuringExecution?: Array<PodAffinityTerm>
}

/**
 * PodCondition contains details for the current condition of this pod.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface PodCondition {
  /** Last time we probed the condition. */
  lastProbeTime?: Time
  /** Last time the condition transitioned from one status to another. */
  lastTransitionTime?: Time
  /** Human-readable message indicating details about last transition. */
  message?: string
  /** Unique, one-word, CamelCase reason for the condition's last transition. */
  reason?: string
  /** Status is the status of the condition. Can be True, False, Unknown. More info: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#pod-conditions */
  status: string
  /** Type is the type of the condition. More info: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#pod-conditions */
  type: string
}

/**
 * PodDNSConfig defines the DNS parameters of a pod in addition to those generated from DNSPolicy.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface PodDNSConfig {
  /** A list of DNS name server IP addresses. This will be appended to the base nameservers generated from DNSPolicy. Duplicated nameservers will be removed. */
  nameservers?: Array<string>
  /** A list of DNS resolver options. This will be merged with the base options generated from DNSPolicy. Duplicated entries will be removed. Resolution options given in Options will override those that appear in the base DNSPolicy. */
  options?: Array<PodDNSConfigOption>
  /** A list of DNS search domains for host-name lookup. This will be appended to the base search paths generated from DNSPolicy. Duplicated search paths will be removed. */
  searches?: Array<string>
}

/**
 * PodDNSConfigOption defines DNS resolver options of a pod.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface PodDNSConfigOption {
  /** Required. */
  name?: string
  value?: string
}

/**
 * PodIP represents a single IP address allocated to the pod.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface PodIP {
  /** IP is the IP address assigned to the pod */
  ip?: string
}

/**
 * PodOS defines the OS parameters of a pod.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface PodOS {
  /** Name is the name of the operating system. The currently supported values are linux and windows. Additional value may be defined in future and can be one of: https://github.com/opencontainers/runtime-spec/blob/master/config.md#platform-specific-configuration Clients should expect to handle additional values and treat unrecognized values in this field as os: null */
  name: string
}

/**
 * PodReadinessGate contains the reference to a pod condition
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface PodReadinessGate {
  /** ConditionType refers to a condition in the pod's condition list with matching type. */
  conditionType: string
}

/**
 * PodResourceClaim references exactly one ResourceClaim through a ClaimSource. It adds a name to it that uniquely identifies the ResourceClaim inside the Pod. Containers that need access to the ResourceClaim reference it with this name.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface PodResourceClaim {
  /** Name uniquely identifies this resource claim inside the pod. This must be a DNS_LABEL. */
  name: string
  /** Source describes where to find the ResourceClaim. */
  source?: ClaimSource
}

/**
 * PodResourceClaimStatus is stored in the PodStatus for each PodResourceClaim which references a ResourceClaimTemplate. It stores the generated name for the corresponding ResourceClaim.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface PodResourceClaimStatus {
  /** Name uniquely identifies this resource claim inside the pod. This must match the name of an entry in pod.spec.resourceClaims, which implies that the string must be a DNS_LABEL. */
  name: string
  /** ResourceClaimName is the name of the ResourceClaim that was generated for the Pod in the namespace of the Pod. It this is unset, then generating a ResourceClaim was not necessary. The pod.spec.resourceClaims entry can be ignored in this case. */
  resourceClaimName?: string
}

/**
 * PodSchedulingGate is associated to a Pod to guard its scheduling.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface PodSchedulingGate {
  /** Name of the scheduling gate. Each scheduling gate must have a unique name field. */
  name: string
}

/**
 * PodSecurityContext holds pod-level security attributes and common container settings. Some fields are also present in container.securityContext.  Field values of container.securityContext take precedence over field values of PodSecurityContext.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface PodSecurityContext {
  /** appArmorProfile is the AppArmor options to use by the containers in this pod. Note that this field cannot be set when spec.os.name is windows. */
  appArmorProfile?: AppArmorProfile
  /**
   * A special supplemental group that applies to all containers in a pod. Some volume types allow the Kubelet to change the ownership of that volume to be owned by the pod:
   *
   * **Details**
   *
   * 1. The owning GID will be the FSGroup 2. The setgid bit is set (new files created in the volume will be owned by FSGroup) 3. The permission bits are OR'd with rw-rw----
   *
   * If unset, the Kubelet will not modify the ownership and permissions of any volume. Note that this field cannot be set when spec.os.name is windows.
   */
  fsGroup?: number
  /** fsGroupChangePolicy defines behavior of changing ownership and permission of the volume before being exposed inside Pod. This field will only apply to volume types which support fsGroup based ownership(and permissions). It will have no effect on ephemeral volume types such as: secret, configmaps and emptydir. Valid values are "OnRootMismatch" and "Always". If not specified, "Always" is used. Note that this field cannot be set when spec.os.name is windows. */
  fsGroupChangePolicy?: string
  /** The GID to run the entrypoint of the container process. Uses runtime default if unset. May also be set in SecurityContext.  If set in both SecurityContext and PodSecurityContext, the value specified in SecurityContext takes precedence for that container. Note that this field cannot be set when spec.os.name is windows. */
  runAsGroup?: number
  /** Indicates that the container must run as a non-root user. If true, the Kubelet will validate the image at runtime to ensure that it does not run as UID 0 (root) and fail to start the container if it does. If unset or false, no such validation will be performed. May also be set in SecurityContext.  If set in both SecurityContext and PodSecurityContext, the value specified in SecurityContext takes precedence. */
  runAsNonRoot?: boolean
  /** The UID to run the entrypoint of the container process. Defaults to user specified in image metadata if unspecified. May also be set in SecurityContext.  If set in both SecurityContext and PodSecurityContext, the value specified in SecurityContext takes precedence for that container. Note that this field cannot be set when spec.os.name is windows. */
  runAsUser?: number
  /** The SELinux context to be applied to all containers. If unspecified, the container runtime will allocate a random SELinux context for each container.  May also be set in SecurityContext.  If set in both SecurityContext and PodSecurityContext, the value specified in SecurityContext takes precedence for that container. Note that this field cannot be set when spec.os.name is windows. */
  seLinuxOptions?: SELinuxOptions
  /** The seccomp options to use by the containers in this pod. Note that this field cannot be set when spec.os.name is windows. */
  seccompProfile?: SeccompProfile
  /** A list of groups applied to the first process run in each container, in addition to the container's primary GID, the fsGroup (if specified), and group memberships defined in the container image for the uid of the container process. If unspecified, no additional groups are added to any container. Note that group memberships defined in the container image for the uid of the container process are still effective, even if they are not included in this list. Note that this field cannot be set when spec.os.name is windows. */
  supplementalGroups?: Array<number>
  /** Sysctls hold a list of namespaced sysctls used for the pod. Pods with unsupported sysctls (by the container runtime) might fail to launch. Note that this field cannot be set when spec.os.name is windows. */
  sysctls?: Array<Sysctl>
  /** The Windows specific settings applied to all containers. If unspecified, the options within a container's SecurityContext will be used. If set in both SecurityContext and PodSecurityContext, the value specified in SecurityContext takes precedence. Note that this field cannot be set when spec.os.name is linux. */
  windowsOptions?: WindowsSecurityContextOptions
}

/**
 * PodSpec is a description of a pod.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface PodSpec {
  /** Optional duration in seconds the pod may be active on the node relative to StartTime before the system will actively try to mark it failed and kill associated containers. Value must be a positive integer. */
  activeDeadlineSeconds?: number
  /** If specified, the pod's scheduling constraints */
  affinity?: Affinity
  /** AutomountServiceAccountToken indicates whether a service account token should be automatically mounted. */
  automountServiceAccountToken?: boolean
  /** List of containers belonging to the pod. Containers cannot currently be added or removed. There must be at least one container in a Pod. Cannot be updated. */
  containers: Array<Container>
  /** Specifies the DNS parameters of a pod. Parameters specified here will be merged to the generated DNS configuration based on DNSPolicy. */
  dnsConfig?: PodDNSConfig
  /** Set DNS policy for the pod. Defaults to "ClusterFirst". Valid values are 'ClusterFirstWithHostNet', 'ClusterFirst', 'Default' or 'None'. DNS parameters given in DNSConfig will be merged with the policy selected with DNSPolicy. To have DNS options set along with hostNetwork, you have to specify DNS policy explicitly to 'ClusterFirstWithHostNet'. */
  dnsPolicy?: string
  /** EnableServiceLinks indicates whether information about services should be injected into pod's environment variables, matching the syntax of Docker links. Optional: Defaults to true. */
  enableServiceLinks?: boolean
  /** List of ephemeral containers run in this pod. Ephemeral containers may be run in an existing pod to perform user-initiated actions such as debugging. This list cannot be specified when creating a pod, and it cannot be modified by updating the pod spec. In order to add an ephemeral container to an existing pod, use the pod's ephemeralcontainers subresource. */
  ephemeralContainers?: Array<EphemeralContainer>
  /** HostAliases is an optional list of hosts and IPs that will be injected into the pod's hosts file if specified. */
  hostAliases?: Array<HostAlias>
  /** Use the host's ipc namespace. Optional: Default to false. */
  hostIPC?: boolean
  /** Host networking requested for this pod. Use the host's network namespace. If this option is set, the ports that will be used must be specified. Default to false. */
  hostNetwork?: boolean
  /** Use the host's pid namespace. Optional: Default to false. */
  hostPID?: boolean
  /** Use the host's user namespace. Optional: Default to true. If set to true or not present, the pod will be run in the host user namespace, useful for when the pod needs a feature only available to the host user namespace, such as loading a kernel module with CAP_SYS_MODULE. When set to false, a new userns is created for the pod. Setting false is useful for mitigating container breakout vulnerabilities even allowing users to run their containers as root without actually having root privileges on the host. This field is alpha-level and is only honored by servers that enable the UserNamespacesSupport feature. */
  hostUsers?: boolean
  /** Specifies the hostname of the Pod If not specified, the pod's hostname will be set to a system-defined value. */
  hostname?: string
  /** ImagePullSecrets is an optional list of references to secrets in the same namespace to use for pulling any of the images used by this PodSpec. If specified, these secrets will be passed to individual puller implementations for them to use. More info: https://kubernetes.io/docs/concepts/containers/images#specifying-imagepullsecrets-on-a-pod */
  imagePullSecrets?: Array<LocalObjectReference>
  /** List of initialization containers belonging to the pod. Init containers are executed in order prior to containers being started. If any init container fails, the pod is considered to have failed and is handled according to its restartPolicy. The name for an init container or normal container must be unique among all containers. Init containers may not have Lifecycle actions, Readiness probes, Liveness probes, or Startup probes. The resourceRequirements of an init container are taken into account during scheduling by finding the highest request/limit for each resource type, and then using the max of of that value or the sum of the normal containers. Limits are applied to init containers in a similar fashion. Init containers cannot currently be added or removed. Cannot be updated. More info: https://kubernetes.io/docs/concepts/workloads/pods/init-containers/ */
  initContainers?: Array<Container>
  /** NodeName is a request to schedule this pod onto a specific node. If it is non-empty, the scheduler simply schedules this pod onto that node, assuming that it fits resource requirements. */
  nodeName?: string
  /** NodeSelector is a selector which must be true for the pod to fit on a node. Selector which must match a node's labels for the pod to be scheduled on that node. More info: https://kubernetes.io/docs/concepts/configuration/assign-pod-node/ */
  nodeSelector?: {
    [name: string]: string
  }
  /**
   * Specifies the OS of the containers in the pod. Some pod and container fields are restricted if this is set.
   *
   * **Details**
   *
   * If the OS field is set to linux, the following fields must be unset: -securityContext.windowsOptions
   *
   * If the OS field is set to windows, following fields must be unset: - spec.hostPID - spec.hostIPC - spec.hostUsers - spec.securityContext.appArmorProfile - spec.securityContext.seLinuxOptions - spec.securityContext.seccompProfile - spec.securityContext.fsGroup - spec.securityContext.fsGroupChangePolicy - spec.securityContext.sysctls - spec.shareProcessNamespace - spec.securityContext.runAsUser - spec.securityContext.runAsGroup - spec.securityContext.supplementalGroups - spec.containers[*].securityContext.appArmorProfile - spec.containers[*].securityContext.seLinuxOptions - spec.containers[*].securityContext.seccompProfile - spec.containers[*].securityContext.capabilities - spec.containers[*].securityContext.readOnlyRootFilesystem - spec.containers[*].securityContext.privileged - spec.containers[*].securityContext.allowPrivilegeEscalation - spec.containers[*].securityContext.procMount - spec.containers[*].securityContext.runAsUser - spec.containers[*].securityContext.runAsGroup
   */
  os?: PodOS
  /** Overhead represents the resource overhead associated with running a pod for a given RuntimeClass. This field will be autopopulated at admission time by the RuntimeClass admission controller. If the RuntimeClass admission controller is enabled, overhead must not be set in Pod create requests. The RuntimeClass admission controller will reject Pod create requests which have the overhead already set. If RuntimeClass is configured and selected in the PodSpec, Overhead will be set to the value defined in the corresponding RuntimeClass, otherwise it will remain unset and treated as zero. More info: https://git.k8s.io/enhancements/keps/sig-node/688-pod-overhead/README.md */
  overhead?: {
    [name: string]: Quantity
  }
  /** PreemptionPolicy is the Policy for preempting pods with lower priority. One of Never, PreemptLowerPriority. Defaults to PreemptLowerPriority if unset. */
  preemptionPolicy?: string
  /** The priority value. Various system components use this field to find the priority of the pod. When Priority Admission Controller is enabled, it prevents users from setting this field. The admission controller populates this field from PriorityClassName. The higher the value, the higher the priority. */
  priority?: number
  /** If specified, indicates the pod's priority. "system-node-critical" and "system-cluster-critical" are two special keywords which indicate the highest priorities with the former being the highest priority. Any other name must be defined by creating a PriorityClass object with that name. If not specified, the pod priority will be default or zero if there is no default. */
  priorityClassName?: string
  /** If specified, all readiness gates will be evaluated for pod readiness. A pod is ready when all its containers are ready AND all conditions specified in the readiness gates have status equal to "True" More info: https://git.k8s.io/enhancements/keps/sig-network/580-pod-readiness-gates */
  readinessGates?: Array<PodReadinessGate>
  /**
   * ResourceClaims defines which ResourceClaims must be allocated and reserved before the Pod is allowed to start. The resources will be made available to those containers which consume them by name.
   *
   * **Details**
   *
   * This is an alpha field and requires enabling the DynamicResourceAllocation feature gate.
   *
   * This field is immutable.
   */
  resourceClaims?: Array<PodResourceClaim>
  /** Restart policy for all containers within the pod. One of Always, OnFailure, Never. In some contexts, only a subset of those values may be permitted. Default to Always. More info: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/#restart-policy */
  restartPolicy?: string
  /** RuntimeClassName refers to a RuntimeClass object in the node.k8s.io group, which should be used to run this pod.  If no RuntimeClass resource matches the named class, the pod will not be run. If unset or empty, the "legacy" RuntimeClass will be used, which is an implicit class with an empty definition that uses the default runtime handler. More info: https://git.k8s.io/enhancements/keps/sig-node/585-runtime-class */
  runtimeClassName?: string
  /** If specified, the pod will be dispatched by specified scheduler. If not specified, the pod will be dispatched by default scheduler. */
  schedulerName?: string
  /**
   * SchedulingGates is an opaque list of values that if specified will block scheduling the pod. If schedulingGates is not empty, the pod will stay in the SchedulingGated state and the scheduler will not attempt to schedule the pod.
   *
   * **Details**
   *
   * SchedulingGates can only be set at pod creation time, and be removed only afterwards.
   */
  schedulingGates?: Array<PodSchedulingGate>
  /** SecurityContext holds pod-level security attributes and common container settings. Optional: Defaults to empty.  See type description for default values of each field. */
  securityContext?: PodSecurityContext
  /** DeprecatedServiceAccount is a deprecated alias for ServiceAccountName. Deprecated: Use serviceAccountName instead. */
  serviceAccount?: string
  /** ServiceAccountName is the name of the ServiceAccount to use to run this pod. More info: https://kubernetes.io/docs/tasks/configure-pod-container/configure-service-account/ */
  serviceAccountName?: string
  /** If true the pod's hostname will be configured as the pod's FQDN, rather than the leaf name (the default). In Linux containers, this means setting the FQDN in the hostname field of the kernel (the nodename field of struct utsname). In Windows containers, this means setting the registry value of hostname for the registry key HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters to FQDN. If a pod does not have FQDN, this has no effect. Default to false. */
  setHostnameAsFQDN?: boolean
  /** Share a single process namespace between all of the containers in a pod. When this is set containers will be able to view and signal processes from other containers in the same pod, and the first process in each container will not be assigned PID 1. HostPID and ShareProcessNamespace cannot both be set. Optional: Default to false. */
  shareProcessNamespace?: boolean
  /** If specified, the fully qualified Pod hostname will be "<hostname>.<subdomain>.<pod namespace>.svc.<cluster domain>". If not specified, the pod will not have a domainname at all. */
  subdomain?: string
  /** Optional duration in seconds the pod needs to terminate gracefully. May be decreased in delete request. Value must be non-negative integer. The value zero indicates stop immediately via the kill signal (no opportunity to shut down). If this value is nil, the default grace period will be used instead. The grace period is the duration in seconds after the processes running in the pod are sent a termination signal and the time when the processes are forcibly halted with a kill signal. Set this value longer than the expected cleanup time for your process. Defaults to 30 seconds. */
  terminationGracePeriodSeconds?: number
  /** If specified, the pod's tolerations. */
  tolerations?: Array<Toleration>
  /** TopologySpreadConstraints describes how a group of pods ought to spread across topology domains. Scheduler will schedule pods in a way which abides by the constraints. All topologySpreadConstraints are ANDed. */
  topologySpreadConstraints?: Array<TopologySpreadConstraint>
  /** List of volumes that can be mounted by containers belonging to the pod. More info: https://kubernetes.io/docs/concepts/storage/volumes */
  volumes?: Array<Volume>
}

/**
 * PodStatus represents information about the status of a pod. Status may trail the actual state of a system, especially if the node that hosts the pod cannot contact the control plane.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface PodStatus {
  /** Current service state of pod. More info: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#pod-conditions */
  conditions?: Array<PodCondition>
  /** The list has one entry per container in the manifest. More info: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#pod-and-container-status */
  containerStatuses?: Array<ContainerStatus>
  /** Status for any ephemeral containers that have run in this pod. */
  ephemeralContainerStatuses?: Array<ContainerStatus>
  /** hostIP holds the IP address of the host to which the pod is assigned. Empty if the pod has not started yet. A pod can be assigned to a node that has a problem in kubelet which in turns mean that HostIP will not be updated even if there is a node is assigned to pod */
  hostIP?: string
  /** hostIPs holds the IP addresses allocated to the host. If this field is specified, the first entry must match the hostIP field. This list is empty if the pod has not started yet. A pod can be assigned to a node that has a problem in kubelet which in turns means that HostIPs will not be updated even if there is a node is assigned to this pod. */
  hostIPs?: Array<HostIP>
  /** The list has one entry per init container in the manifest. The most recent successful init container will have ready = true, the most recently started container will have startTime set. More info: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#pod-and-container-status */
  initContainerStatuses?: Array<ContainerStatus>
  /** A human readable message indicating details about why the pod is in this condition. */
  message?: string
  /** nominatedNodeName is set only when this pod preempts other pods on the node, but it cannot be scheduled right away as preemption victims receive their graceful termination periods. This field does not guarantee that the pod will be scheduled on this node. Scheduler may decide to place the pod elsewhere if other nodes become available sooner. Scheduler may also decide to give the resources on this node to a higher priority pod that is created after preemption. As a result, this field may be different than PodSpec.nodeName when the pod is scheduled. */
  nominatedNodeName?: string
  /**
   * The phase of a Pod is a simple, high-level summary of where the Pod is in its lifecycle. The conditions array, the reason and message fields, and the individual container status arrays contain more detail about the pod's status. There are five possible phase values:
   *
   * **Details**
   *
   * Pending: The pod has been accepted by the Kubernetes system, but one or more of the container images has not been created. This includes time before being scheduled as well as time spent downloading images over the network, which could take a while. Running: The pod has been bound to a node, and all of the containers have been created. At least one container is still running, or is in the process of starting or restarting. Succeeded: All containers in the pod have terminated in success, and will not be restarted. Failed: All containers in the pod have terminated, and at least one container has terminated in failure. The container either exited with non-zero status or was terminated by the system. Unknown: For some reason the state of the pod could not be obtained, typically due to an error in communicating with the host of the pod.
   *
   * More info: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#pod-phase
   */
  phase?: string
  /** podIP address allocated to the pod. Routable at least within the cluster. Empty if not yet allocated. */
  podIP?: string
  /** podIPs holds the IP addresses allocated to the pod. If this field is specified, the 0th entry must match the podIP field. Pods may be allocated at most 1 value for each of IPv4 and IPv6. This list is empty if no IPs have been allocated yet. */
  podIPs?: Array<PodIP>
  /** The Quality of Service (QOS) classification assigned to the pod based on resource requirements See PodQOSClass type for available QOS classes More info: https://kubernetes.io/docs/concepts/workloads/pods/pod-qos/#quality-of-service-classes */
  qosClass?: string
  /** A brief CamelCase message indicating details about why the pod is in this state. e.g. 'Evicted' */
  reason?: string
  /** Status of resources resize desired for pod's containers. It is empty if no resources resize is pending. Any changes to container resources will automatically set this to "Proposed" */
  resize?: string
  /** Status of resource claims. */
  resourceClaimStatuses?: Array<PodResourceClaimStatus>
  /** RFC 3339 date and time at which the object was acknowledged by the Kubelet. This is before the Kubelet pulled the container image(s) for the pod. */
  startTime?: Time
}

/**
 * PortworxVolumeSource represents a Portworx volume resource.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface PortworxVolumeSource {
  /** fSType represents the filesystem type to mount Must be a filesystem type supported by the host operating system. Ex. "ext4", "xfs". Implicitly inferred to be "ext4" if unspecified. */
  fsType?: string
  /** readOnly defaults to false (read/write). ReadOnly here will force the ReadOnly setting in VolumeMounts. */
  readOnly?: boolean
  /** volumeID uniquely identifies a Portworx volume */
  volumeID: string
}

/**
 * An empty preferred scheduling term matches all objects with implicit weight 0 (i.e. it's a no-op). A null preferred scheduling term matches no objects (i.e. is also a no-op).
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface PreferredSchedulingTerm {
  /** A node selector term, associated with the corresponding weight. */
  preference: NodeSelectorTerm
  /** Weight associated with matching the corresponding nodeSelectorTerm, in the range 1-100. */
  weight: number
}

/**
 * Probe describes a health check to be performed against a container to determine whether it is alive or ready to receive traffic.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Probe {
  /** Exec specifies the action to take. */
  exec?: ExecAction
  /** Minimum consecutive failures for the probe to be considered failed after having succeeded. Defaults to 3. Minimum value is 1. */
  failureThreshold?: number
  /** GRPC specifies an action involving a GRPC port. */
  grpc?: GRPCAction
  /** HTTPGet specifies the http request to perform. */
  httpGet?: HTTPGetAction
  /** Number of seconds after the container has started before liveness probes are initiated. More info: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#container-probes */
  initialDelaySeconds?: number
  /** How often (in seconds) to perform the probe. Default to 10 seconds. Minimum value is 1. */
  periodSeconds?: number
  /** Minimum consecutive successes for the probe to be considered successful after having failed. Defaults to 1. Must be 1 for liveness and startup. Minimum value is 1. */
  successThreshold?: number
  /** TCPSocket specifies an action involving a TCP port. */
  tcpSocket?: TCPSocketAction
  /** Optional duration in seconds the pod needs to terminate gracefully upon probe failure. The grace period is the duration in seconds after the processes running in the pod are sent a termination signal and the time when the processes are forcibly halted with a kill signal. Set this value longer than the expected cleanup time for your process. If this value is nil, the pod's terminationGracePeriodSeconds will be used. Otherwise, this value overrides the value provided by the pod spec. Value must be non-negative integer. The value zero indicates stop immediately via the kill signal (no opportunity to shut down). This is a beta field and requires enabling ProbeTerminationGracePeriod feature gate. Minimum value is 1. spec.terminationGracePeriodSeconds is used if unset. */
  terminationGracePeriodSeconds?: number
  /** Number of seconds after which the probe times out. Defaults to 1 second. Minimum value is 1. More info: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#container-probes */
  timeoutSeconds?: number
}

/**
 * Represents a projected volume source
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ProjectedVolumeSource {
  /** defaultMode are the mode bits used to set permissions on created files by default. Must be an octal value between 0000 and 0777 or a decimal value between 0 and 511. YAML accepts both octal and decimal values, JSON requires decimal values for mode bits. Directories within the path are not affected by this setting. This might be in conflict with other options that affect the file mode, like fsGroup, and the result can be other mode bits set. */
  defaultMode?: number
  /** sources is the list of volume projections */
  sources?: Array<VolumeProjection>
}

/**
 * Represents a Quobyte mount that lasts the lifetime of a pod. Quobyte volumes do not support ownership management or SELinux relabeling.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface QuobyteVolumeSource {
  /** group to map volume access to Default is no group */
  group?: string
  /** readOnly here will force the Quobyte volume to be mounted with read-only permissions. Defaults to false. */
  readOnly?: boolean
  /** registry represents a single or multiple Quobyte Registry services specified as a string as host:port pair (multiple entries are separated with commas) which acts as the central registry for volumes */
  registry: string
  /** tenant owning the given Quobyte volume in the Backend Used with dynamically provisioned Quobyte volumes, value is set by the plugin */
  tenant?: string
  /** user to map volume access to Defaults to serivceaccount user */
  user?: string
  /** volume is a string that references an already created Quobyte volume by name. */
  volume: string
}

/**
 * Represents a Rados Block Device mount that lasts the lifetime of a pod. RBD volumes support ownership management and SELinux relabeling.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface RBDVolumeSource {
  /** fsType is the filesystem type of the volume that you want to mount. Tip: Ensure that the filesystem type is supported by the host operating system. Examples: "ext4", "xfs", "ntfs". Implicitly inferred to be "ext4" if unspecified. More info: https://kubernetes.io/docs/concepts/storage/volumes#rbd */
  fsType?: string
  /** image is the rados image name. More info: https://examples.k8s.io/volumes/rbd/README.md#how-to-use-it */
  image: string
  /** keyring is the path to key ring for RBDUser. Default is /etc/ceph/keyring. More info: https://examples.k8s.io/volumes/rbd/README.md#how-to-use-it */
  keyring?: string
  /** monitors is a collection of Ceph monitors. More info: https://examples.k8s.io/volumes/rbd/README.md#how-to-use-it */
  monitors: Array<string>
  /** pool is the rados pool name. Default is rbd. More info: https://examples.k8s.io/volumes/rbd/README.md#how-to-use-it */
  pool?: string
  /** readOnly here will force the ReadOnly setting in VolumeMounts. Defaults to false. More info: https://examples.k8s.io/volumes/rbd/README.md#how-to-use-it */
  readOnly?: boolean
  /** secretRef is name of the authentication secret for RBDUser. If provided overrides keyring. Default is nil. More info: https://examples.k8s.io/volumes/rbd/README.md#how-to-use-it */
  secretRef?: LocalObjectReference
  /** user is the rados user name. Default is admin. More info: https://examples.k8s.io/volumes/rbd/README.md#how-to-use-it */
  user?: string
}

/**
 * ResourceClaim references one entry in PodSpec.ResourceClaims.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ResourceClaim {
  /** Name must match the name of one entry in pod.spec.resourceClaims of the Pod where this field is used. It makes that resource available inside a container. */
  name: string
}

/**
 * ResourceFieldSelector represents container resources (cpu, memory) and their output format
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ResourceFieldSelector {
  /** Container name: required for volumes, optional for env vars */
  containerName?: string
  /** Specifies the output format of the exposed resources, defaults to "1" */
  divisor?: Quantity
  /** Required: resource to select */
  resource: string
}

/**
 * ResourceRequirements describes the compute resource requirements.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ResourceRequirements {
  /**
   * Claims lists the names of resources, defined in spec.resourceClaims, that are used by this container.
   *
   * **Details**
   *
   * This is an alpha field and requires enabling the DynamicResourceAllocation feature gate.
   *
   * This field is immutable. It can only be set for containers.
   */
  claims?: Array<ResourceClaim>
  /** Limits describes the maximum amount of compute resources allowed. More info: https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/ */
  limits?: {
    [name: string]: Quantity
  }
  /** Requests describes the minimum amount of compute resources required. If Requests is omitted for a container, it defaults to Limits if that is explicitly specified, otherwise to an implementation-defined value. Requests cannot exceed Limits. More info: https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/ */
  requests?: {
    [name: string]: Quantity
  }
}

/**
 * SELinuxOptions are the labels to be applied to the container
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface SELinuxOptions {
  /** Level is SELinux level label that applies to the container. */
  level?: string
  /** Role is a SELinux role label that applies to the container. */
  role?: string
  /** Type is a SELinux type label that applies to the container. */
  type?: string
  /** User is a SELinux user label that applies to the container. */
  user?: string
}

/**
 * ScaleIOVolumeSource represents a persistent ScaleIO volume
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ScaleIOVolumeSource {
  /** fsType is the filesystem type to mount. Must be a filesystem type supported by the host operating system. Ex. "ext4", "xfs", "ntfs". Default is "xfs". */
  fsType?: string
  /** gateway is the host address of the ScaleIO API Gateway. */
  gateway: string
  /** protectionDomain is the name of the ScaleIO Protection Domain for the configured storage. */
  protectionDomain?: string
  /** readOnly Defaults to false (read/write). ReadOnly here will force the ReadOnly setting in VolumeMounts. */
  readOnly?: boolean
  /** secretRef references to the secret for ScaleIO user and other sensitive information. If this is not provided, Login operation will fail. */
  secretRef: LocalObjectReference
  /** sslEnabled Flag enable/disable SSL communication with Gateway, default false */
  sslEnabled?: boolean
  /** storageMode indicates whether the storage for a volume should be ThickProvisioned or ThinProvisioned. Default is ThinProvisioned. */
  storageMode?: string
  /** storagePool is the ScaleIO Storage Pool associated with the protection domain. */
  storagePool?: string
  /** system is the name of the storage system as configured in ScaleIO. */
  system: string
  /** volumeName is the name of a volume already created in the ScaleIO system that is associated with this volume source. */
  volumeName?: string
}

/**
 * SeccompProfile defines a pod/container's seccomp profile settings. Only one profile source may be set.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface SeccompProfile {
  /** localhostProfile indicates a profile defined in a file on the node should be used. The profile must be preconfigured on the node to work. Must be a descending path, relative to the kubelet's configured seccomp profile location. Must be set if type is "Localhost". Must NOT be set for any other type. */
  localhostProfile?: string
  /**
   * type indicates which kind of seccomp profile will be applied. Valid options are:
   *
   * **Details**
   *
   * Localhost - a profile defined in a file on the node should be used. RuntimeDefault - the container runtime default profile should be used. Unconfined - no profile should be applied.
   */
  type: string
}

/**
 * SecretEnvSource selects a Secret to populate the environment variables with.
 *
 * **Details**
 *
 * The contents of the target Secret's Data field will represent the key-value pairs as environment variables.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface SecretEnvSource {
  /** Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names */
  name?: string
  /** Specify whether the Secret must be defined */
  optional?: boolean
}

/**
 * SecretKeySelector selects a key of a Secret.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface SecretKeySelector {
  /** The key of the secret to select from.  Must be a valid secret key. */
  key: string
  /** Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names */
  name?: string
  /** Specify whether the Secret or its key must be defined */
  optional?: boolean
}

/**
 * Adapts a secret into a projected volume.
 *
 * **Details**
 *
 * The contents of the target Secret's Data field will be presented in a projected volume as files using the keys in the Data field as the file names. Note that this is identical to a secret volume source without the default mode.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface SecretProjection {
  /** items if unspecified, each key-value pair in the Data field of the referenced Secret will be projected into the volume as a file whose name is the key and content is the value. If specified, the listed keys will be projected into the specified paths, and unlisted keys will not be present. If a key is specified which is not present in the Secret, the volume setup will error unless it is marked optional. Paths must be relative and may not contain the '..' path or start with '..'. */
  items?: Array<KeyToPath>
  /** Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names */
  name?: string
  /** optional field specify whether the Secret or its key must be defined */
  optional?: boolean
}

/**
 * Adapts a Secret into a volume.
 *
 * **Details**
 *
 * The contents of the target Secret's Data field will be presented in a volume as files using the keys in the Data field as the file names. Secret volumes support ownership management and SELinux relabeling.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface SecretVolumeSource {
  /** defaultMode is Optional: mode bits used to set permissions on created files by default. Must be an octal value between 0000 and 0777 or a decimal value between 0 and 511. YAML accepts both octal and decimal values, JSON requires decimal values for mode bits. Defaults to 0644. Directories within the path are not affected by this setting. This might be in conflict with other options that affect the file mode, like fsGroup, and the result can be other mode bits set. */
  defaultMode?: number
  /** items If unspecified, each key-value pair in the Data field of the referenced Secret will be projected into the volume as a file whose name is the key and content is the value. If specified, the listed keys will be projected into the specified paths, and unlisted keys will not be present. If a key is specified which is not present in the Secret, the volume setup will error unless it is marked optional. Paths must be relative and may not contain the '..' path or start with '..'. */
  items?: Array<KeyToPath>
  /** optional field specify whether the Secret or its keys must be defined */
  optional?: boolean
  /** secretName is the name of the secret in the pod's namespace to use. More info: https://kubernetes.io/docs/concepts/storage/volumes#secret */
  secretName?: string
}

/**
 * SecurityContext holds security configuration that will be applied to a container. Some fields are present in both SecurityContext and PodSecurityContext.  When both are set, the values in SecurityContext take precedence.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface SecurityContext {
  /** AllowPrivilegeEscalation controls whether a process can gain more privileges than its parent process. This bool directly controls if the no_new_privs flag will be set on the container process. AllowPrivilegeEscalation is true always when the container is: 1) run as Privileged 2) has CAP_SYS_ADMIN Note that this field cannot be set when spec.os.name is windows. */
  allowPrivilegeEscalation?: boolean
  /** appArmorProfile is the AppArmor options to use by this container. If set, this profile overrides the pod's appArmorProfile. Note that this field cannot be set when spec.os.name is windows. */
  appArmorProfile?: AppArmorProfile
  /** The capabilities to add/drop when running containers. Defaults to the default set of capabilities granted by the container runtime. Note that this field cannot be set when spec.os.name is windows. */
  capabilities?: Capabilities
  /** Run container in privileged mode. Processes in privileged containers are essentially equivalent to root on the host. Defaults to false. Note that this field cannot be set when spec.os.name is windows. */
  privileged?: boolean
  /** procMount denotes the type of proc mount to use for the containers. The default is DefaultProcMount which uses the container runtime defaults for readonly paths and masked paths. This requires the ProcMountType feature flag to be enabled. Note that this field cannot be set when spec.os.name is windows. */
  procMount?: string
  /** Whether this container has a read-only root filesystem. Default is false. Note that this field cannot be set when spec.os.name is windows. */
  readOnlyRootFilesystem?: boolean
  /** The GID to run the entrypoint of the container process. Uses runtime default if unset. May also be set in PodSecurityContext.  If set in both SecurityContext and PodSecurityContext, the value specified in SecurityContext takes precedence. Note that this field cannot be set when spec.os.name is windows. */
  runAsGroup?: number
  /** Indicates that the container must run as a non-root user. If true, the Kubelet will validate the image at runtime to ensure that it does not run as UID 0 (root) and fail to start the container if it does. If unset or false, no such validation will be performed. May also be set in PodSecurityContext.  If set in both SecurityContext and PodSecurityContext, the value specified in SecurityContext takes precedence. */
  runAsNonRoot?: boolean
  /** The UID to run the entrypoint of the container process. Defaults to user specified in image metadata if unspecified. May also be set in PodSecurityContext.  If set in both SecurityContext and PodSecurityContext, the value specified in SecurityContext takes precedence. Note that this field cannot be set when spec.os.name is windows. */
  runAsUser?: number
  /** The SELinux context to be applied to the container. If unspecified, the container runtime will allocate a random SELinux context for each container.  May also be set in PodSecurityContext.  If set in both SecurityContext and PodSecurityContext, the value specified in SecurityContext takes precedence. Note that this field cannot be set when spec.os.name is windows. */
  seLinuxOptions?: SELinuxOptions
  /** The seccomp options to use by this container. If seccomp options are provided at both the pod & container level, the container options override the pod options. Note that this field cannot be set when spec.os.name is windows. */
  seccompProfile?: SeccompProfile
  /** The Windows specific settings applied to all containers. If unspecified, the options from the PodSecurityContext will be used. If set in both SecurityContext and PodSecurityContext, the value specified in SecurityContext takes precedence. Note that this field cannot be set when spec.os.name is linux. */
  windowsOptions?: WindowsSecurityContextOptions
}

/**
 * ServiceAccountTokenProjection represents a projected service account token volume. This projection can be used to insert a service account token into the pods runtime filesystem for use against APIs (Kubernetes API Server or otherwise).
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ServiceAccountTokenProjection {
  /** audience is the intended audience of the token. A recipient of a token must identify itself with an identifier specified in the audience of the token, and otherwise should reject the token. The audience defaults to the identifier of the apiserver. */
  audience?: string
  /** expirationSeconds is the requested duration of validity of the service account token. As the token approaches expiration, the kubelet volume plugin will proactively rotate the service account token. The kubelet will start trying to rotate the token if the token is older than 80 percent of its time to live or if the token is older than 24 hours.Defaults to 1 hour and must be at least 10 minutes. */
  expirationSeconds?: number
  /** path is the path relative to the mount point of the file to project the token into. */
  path: string
}

/**
 * SleepAction describes a "sleep" action.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface SleepAction {
  /** Seconds is the number of seconds to sleep. */
  seconds: number
}

/**
 * Represents a StorageOS persistent volume resource.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface StorageOSVolumeSource {
  /** fsType is the filesystem type to mount. Must be a filesystem type supported by the host operating system. Ex. "ext4", "xfs", "ntfs". Implicitly inferred to be "ext4" if unspecified. */
  fsType?: string
  /** readOnly defaults to false (read/write). ReadOnly here will force the ReadOnly setting in VolumeMounts. */
  readOnly?: boolean
  /** secretRef specifies the secret to use for obtaining the StorageOS API credentials.  If not specified, default values will be attempted. */
  secretRef?: LocalObjectReference
  /** volumeName is the human-readable name of the StorageOS volume.  Volume names are only unique within a namespace. */
  volumeName?: string
  /** volumeNamespace specifies the scope of the volume within StorageOS.  If no namespace is specified then the Pod's namespace will be used.  This allows the Kubernetes name scoping to be mirrored within StorageOS for tighter integration. Set VolumeName to any name to override the default behaviour. Set to "default" if you are not using namespaces within StorageOS. Namespaces that do not pre-exist within StorageOS will be created. */
  volumeNamespace?: string
}

/**
 * Sysctl defines a kernel parameter to be set
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Sysctl {
  /** Name of a property to set */
  name: string
  /** Value of a property to set */
  value: string
}

/**
 * TCPSocketAction describes an action based on opening a socket
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface TCPSocketAction {
  /** Optional: Host name to connect to, defaults to the pod IP. */
  host?: string
  /** Number or name of the port to access on the container. Number must be in the range 1 to 65535. Name must be an IANA_SVC_NAME. */
  port: number | string
}

/**
 * The pod this Toleration is attached to tolerates any taint that matches the triple <key,value,effect> using the matching operator <operator>.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Toleration {
  /** Effect indicates the taint effect to match. Empty means match all taint effects. When specified, allowed values are NoSchedule, PreferNoSchedule and NoExecute. */
  effect?: string
  /** Key is the taint key that the toleration applies to. Empty means match all taint keys. If the key is empty, operator must be Exists; this combination means to match all values and all keys. */
  key?: string
  /** Operator represents a key's relationship to the value. Valid operators are Exists and Equal. Defaults to Equal. Exists is equivalent to wildcard for value, so that a pod can tolerate all taints of a particular category. */
  operator?: string
  /** TolerationSeconds represents the period of time the toleration (which must be of effect NoExecute, otherwise this field is ignored) tolerates the taint. By default, it is not set, which means tolerate the taint forever (do not evict). Zero and negative values will be treated as 0 (evict immediately) by the system. */
  tolerationSeconds?: number
  /** Value is the taint value the toleration matches to. If the operator is Exists, the value should be empty, otherwise just a regular string. */
  value?: string
}

/**
 * TopologySpreadConstraint specifies how to spread matching pods among the given topology.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface TopologySpreadConstraint {
  /** LabelSelector is used to find matching pods. Pods that match this label selector are counted to determine the number of pods in their corresponding topology domain. */
  labelSelector?: LabelSelector
  /**
   * MatchLabelKeys is a set of pod label keys to select the pods over which spreading will be calculated. The keys are used to lookup values from the incoming pod labels, those key-value labels are ANDed with labelSelector to select the group of existing pods over which spreading will be calculated for the incoming pod. The same key is forbidden to exist in both MatchLabelKeys and LabelSelector. MatchLabelKeys cannot be set when LabelSelector isn't set. Keys that don't exist in the incoming pod labels will be ignored. A null or empty list means only match against labelSelector.
   *
   * **Details**
   *
   * This is a beta field and requires the MatchLabelKeysInPodTopologySpread feature gate to be enabled (enabled by default).
   */
  matchLabelKeys?: Array<string>
  /** MaxSkew describes the degree to which pods may be unevenly distributed. When `whenUnsatisfiable=DoNotSchedule`, it is the maximum permitted difference between the number of matching pods in the target topology and the global minimum. The global minimum is the minimum number of matching pods in an eligible domain or zero if the number of eligible domains is less than MinDomains. For example, in a 3-zone cluster, MaxSkew is set to 1, and pods with the same labelSelector spread as 2/2/1: In this case, the global minimum is 1. | zone1 | zone2 | zone3 | |  P P  |  P P  |   P   | - if MaxSkew is 1, incoming pod can only be scheduled to zone3 to become 2/2/2; scheduling it onto zone1(zone2) would make the ActualSkew(3-1) on zone1(zone2) violate MaxSkew(1). - if MaxSkew is 2, incoming pod can be scheduled onto any zone. When `whenUnsatisfiable=ScheduleAnyway`, it is used to give higher precedence to topologies that satisfy it. It's a required field. Default value is 1 and 0 is not allowed. */
  maxSkew: number
  /**
   * MinDomains indicates a minimum number of eligible domains. When the number of eligible domains with matching topology keys is less than minDomains, Pod Topology Spread treats "global minimum" as 0, and then the calculation of Skew is performed. And when the number of eligible domains with matching topology keys equals or greater than minDomains, this value has no effect on scheduling. As a result, when the number of eligible domains is less than minDomains, scheduler won't schedule more than maxSkew Pods to those domains. If value is nil, the constraint behaves as if MinDomains is equal to 1. Valid values are integers greater than 0. When value is not nil, WhenUnsatisfiable must be DoNotSchedule.
   *
   * **Details**
   *
   * For example, in a 3-zone cluster, MaxSkew is set to 2, MinDomains is set to 5 and pods with the same labelSelector spread as 2/2/2: | zone1 | zone2 | zone3 | |  P P  |  P P  |  P P  | The number of domains is less than 5(MinDomains), so "global minimum" is treated as 0. In this situation, new pod with the same labelSelector cannot be scheduled, because computed skew will be 3(3 - 0) if new Pod is scheduled to any of the three zones, it will violate MaxSkew.
   */
  minDomains?: number
  /**
   * NodeAffinityPolicy indicates how we will treat Pod's nodeAffinity/nodeSelector when calculating pod topology spread skew. Options are: - Honor: only nodes matching nodeAffinity/nodeSelector are included in the calculations. - Ignore: nodeAffinity/nodeSelector are ignored. All nodes are included in the calculations.
   *
   * **Details**
   *
   * If this value is nil, the behavior is equivalent to the Honor policy. This is a beta-level feature default enabled by the NodeInclusionPolicyInPodTopologySpread feature flag.
   */
  nodeAffinityPolicy?: string
  /**
   * NodeTaintsPolicy indicates how we will treat node taints when calculating pod topology spread skew. Options are: - Honor: nodes without taints, along with tainted nodes for which the incoming pod has a toleration, are included. - Ignore: node taints are ignored. All nodes are included.
   *
   * **Details**
   *
   * If this value is nil, the behavior is equivalent to the Ignore policy. This is a beta-level feature default enabled by the NodeInclusionPolicyInPodTopologySpread feature flag.
   */
  nodeTaintsPolicy?: string
  /** TopologyKey is the key of node labels. Nodes that have a label with this key and identical values are considered to be in the same topology. We consider each <key, value> as a "bucket", and try to put balanced number of pods into each bucket. We define a domain as a particular instance of a topology. Also, we define an eligible domain as a domain whose nodes meet the requirements of nodeAffinityPolicy and nodeTaintsPolicy. e.g. If TopologyKey is "kubernetes.io/hostname", each Node is a domain of that topology. And, if TopologyKey is "topology.kubernetes.io/zone", each zone is a domain of that topology. It's a required field. */
  topologyKey: string
  /**
   * WhenUnsatisfiable indicates how to deal with a pod if it doesn't satisfy the spread constraint. - DoNotSchedule (default) tells the scheduler not to schedule it. - ScheduleAnyway tells the scheduler to schedule the pod in any location,
   *   but giving higher precedence to topologies that would help reduce the
   *   skew.
   * A constraint is considered "Unsatisfiable" for an incoming pod if and only if every possible node assignment for that pod would violate "MaxSkew" on some topology. For example, in a 3-zone cluster, MaxSkew is set to 1, and pods with the same labelSelector spread as 3/1/1: | zone1 | zone2 | zone3 | | P P P |   P   |   P   | If WhenUnsatisfiable is set to DoNotSchedule, incoming pod can only be scheduled to zone2(zone3) to become 3/2/1(3/1/2) as ActualSkew(2-1) on zone2(zone3) satisfies MaxSkew(1). In other words, the cluster can still be imbalanced, but scheduler won't make it *more* imbalanced. It's a required field.
   */
  whenUnsatisfiable: string
}

/**
 * TypedLocalObjectReference contains enough information to let you locate the typed referenced object inside the same namespace.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface TypedLocalObjectReference {
  /** APIGroup is the group for the resource being referenced. If APIGroup is not specified, the specified Kind must be in the core API group. For any other third-party types, APIGroup is required. */
  apiGroup?: string
  /** Kind is the type of resource being referenced */
  kind: string
  /** Name is the name of resource being referenced */
  name: string
}

/**
 * TypedObjectReference contains enough information to locate a typed referenced object.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface TypedObjectReference {
  /** APIGroup is the group for the resource being referenced. If APIGroup is not specified, the specified Kind must be in the core API group. For any other third-party types, APIGroup is required. */
  apiGroup?: string
  /** Kind is the type of resource being referenced */
  kind: string
  /** Name is the name of resource being referenced */
  name: string
  /** Namespace is the namespace of resource being referenced Note that when a namespace is specified, a gateway.networking.k8s.io/ReferenceGrant object is required in the referent namespace to allow that namespace's owner to accept the reference. See the ReferenceGrant documentation for details. (Alpha) This field requires the CrossNamespaceVolumeDataSource feature gate to be enabled. */
  namespace?: string
}

/**
 * Volume represents a named volume in a pod that may be accessed by any container in the pod.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Volume {
  /** awsElasticBlockStore represents an AWS Disk resource that is attached to a kubelet's host machine and then exposed to the pod. More info: https://kubernetes.io/docs/concepts/storage/volumes#awselasticblockstore */
  awsElasticBlockStore?: AWSElasticBlockStoreVolumeSource
  /** azureDisk represents an Azure Data Disk mount on the host and bind mount to the pod. */
  azureDisk?: AzureDiskVolumeSource
  /** azureFile represents an Azure File Service mount on the host and bind mount to the pod. */
  azureFile?: AzureFileVolumeSource
  /** cephFS represents a Ceph FS mount on the host that shares a pod's lifetime */
  cephfs?: CephFSVolumeSource
  /** cinder represents a cinder volume attached and mounted on kubelets host machine. More info: https://examples.k8s.io/mysql-cinder-pd/README.md */
  cinder?: CinderVolumeSource
  /** configMap represents a configMap that should populate this volume */
  configMap?: ConfigMapVolumeSource
  /** csi (Container Storage Interface) represents ephemeral storage that is handled by certain external CSI drivers (Beta feature). */
  csi?: CSIVolumeSource
  /** downwardAPI represents downward API about the pod that should populate this volume */
  downwardAPI?: DownwardAPIVolumeSource
  /** emptyDir represents a temporary directory that shares a pod's lifetime. More info: https://kubernetes.io/docs/concepts/storage/volumes#emptydir */
  emptyDir?: EmptyDirVolumeSource
  /**
   * ephemeral represents a volume that is handled by a cluster storage driver. The volume's lifecycle is tied to the pod that defines it - it will be created before the pod starts, and deleted when the pod is removed.
   *
   * **Details**
   *
   * Use this if: a) the volume is only needed while the pod runs, b) features of normal volumes like restoring from snapshot or capacity
   *    tracking are needed,
   * c) the storage driver is specified through a storage class, and d) the storage driver supports dynamic volume provisioning through
   *    a PersistentVolumeClaim (see EphemeralVolumeSource for more
   *    information on the connection between this volume type
   *    and PersistentVolumeClaim).
   *
   * Use PersistentVolumeClaim or one of the vendor-specific APIs for volumes that persist for longer than the lifecycle of an individual pod.
   *
   * Use CSI for light-weight local ephemeral volumes if the CSI driver is meant to be used that way - see the documentation of the driver for more information.
   *
   * A pod can use both types of ephemeral volumes and persistent volumes at the same time.
   */
  ephemeral?: EphemeralVolumeSource
  /** fc represents a Fibre Channel resource that is attached to a kubelet's host machine and then exposed to the pod. */
  fc?: FCVolumeSource
  /** flexVolume represents a generic volume resource that is provisioned/attached using an exec based plugin. */
  flexVolume?: FlexVolumeSource
  /** flocker represents a Flocker volume attached to a kubelet's host machine. This depends on the Flocker control service being running */
  flocker?: FlockerVolumeSource
  /** gcePersistentDisk represents a GCE Disk resource that is attached to a kubelet's host machine and then exposed to the pod. More info: https://kubernetes.io/docs/concepts/storage/volumes#gcepersistentdisk */
  gcePersistentDisk?: GCEPersistentDiskVolumeSource
  /** gitRepo represents a git repository at a particular revision. DEPRECATED: GitRepo is deprecated. To provision a container with a git repo, mount an EmptyDir into an InitContainer that clones the repo using git, then mount the EmptyDir into the Pod's container. */
  gitRepo?: GitRepoVolumeSource
  /** glusterfs represents a Glusterfs mount on the host that shares a pod's lifetime. More info: https://examples.k8s.io/volumes/glusterfs/README.md */
  glusterfs?: GlusterfsVolumeSource
  /** hostPath represents a pre-existing file or directory on the host machine that is directly exposed to the container. This is generally used for system agents or other privileged things that are allowed to see the host machine. Most containers will NOT need this. More info: https://kubernetes.io/docs/concepts/storage/volumes#hostpath */
  hostPath?: HostPathVolumeSource
  /** iscsi represents an ISCSI Disk resource that is attached to a kubelet's host machine and then exposed to the pod. More info: https://examples.k8s.io/volumes/iscsi/README.md */
  iscsi?: ISCSIVolumeSource
  /** name of the volume. Must be a DNS_LABEL and unique within the pod. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names */
  name: string
  /** nfs represents an NFS mount on the host that shares a pod's lifetime More info: https://kubernetes.io/docs/concepts/storage/volumes#nfs */
  nfs?: NFSVolumeSource
  /** persistentVolumeClaimVolumeSource represents a reference to a PersistentVolumeClaim in the same namespace. More info: https://kubernetes.io/docs/concepts/storage/persistent-volumes#persistentvolumeclaims */
  persistentVolumeClaim?: PersistentVolumeClaimVolumeSource
  /** photonPersistentDisk represents a PhotonController persistent disk attached and mounted on kubelets host machine */
  photonPersistentDisk?: PhotonPersistentDiskVolumeSource
  /** portworxVolume represents a portworx volume attached and mounted on kubelets host machine */
  portworxVolume?: PortworxVolumeSource
  /** projected items for all in one resources secrets, configmaps, and downward API */
  projected?: ProjectedVolumeSource
  /** quobyte represents a Quobyte mount on the host that shares a pod's lifetime */
  quobyte?: QuobyteVolumeSource
  /** rbd represents a Rados Block Device mount on the host that shares a pod's lifetime. More info: https://examples.k8s.io/volumes/rbd/README.md */
  rbd?: RBDVolumeSource
  /** scaleIO represents a ScaleIO persistent volume attached and mounted on Kubernetes nodes. */
  scaleIO?: ScaleIOVolumeSource
  /** secret represents a secret that should populate this volume. More info: https://kubernetes.io/docs/concepts/storage/volumes#secret */
  secret?: SecretVolumeSource
  /** storageOS represents a StorageOS volume attached and mounted on Kubernetes nodes. */
  storageos?: StorageOSVolumeSource
  /** vsphereVolume represents a vSphere volume attached and mounted on kubelets host machine */
  vsphereVolume?: VsphereVirtualDiskVolumeSource
}

/**
 * volumeDevice describes a mapping of a raw block device within a container.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface VolumeDevice {
  /** devicePath is the path inside of the container that the device will be mapped to. */
  devicePath: string
  /** name must match the name of a persistentVolumeClaim in the pod */
  name: string
}

/**
 * VolumeMount describes a mounting of a Volume within a container.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface VolumeMount {
  /** Path within the container at which the volume should be mounted.  Must not contain ':'. */
  mountPath: string
  /** mountPropagation determines how mounts are propagated from the host to container and the other way around. When not set, MountPropagationNone is used. This field is beta in 1.10. When RecursiveReadOnly is set to IfPossible or to Enabled, MountPropagation must be None or unspecified (which defaults to None). */
  mountPropagation?: string
  /** This must match the Name of a Volume. */
  name: string
  /** Mounted read-only if true, read-write otherwise (false or unspecified). Defaults to false. */
  readOnly?: boolean
  /**
   * RecursiveReadOnly specifies whether read-only mounts should be handled recursively.
   *
   * **Details**
   *
   * If ReadOnly is false, this field has no meaning and must be unspecified.
   *
   * If ReadOnly is true, and this field is set to Disabled, the mount is not made recursively read-only.  If this field is set to IfPossible, the mount is made recursively read-only, if it is supported by the container runtime.  If this field is set to Enabled, the mount is made recursively read-only if it is supported by the container runtime, otherwise the pod will not be started and an error will be generated to indicate the reason.
   *
   * If this field is set to IfPossible or Enabled, MountPropagation must be set to None (or be unspecified, which defaults to None).
   *
   * If this field is not specified, it is treated as an equivalent of Disabled.
   */
  recursiveReadOnly?: string
  /** Path within the volume from which the container's volume should be mounted. Defaults to "" (volume's root). */
  subPath?: string
  /** Expanded path within the volume from which the container's volume should be mounted. Behaves similarly to SubPath but environment variable references $(VAR_NAME) are expanded using the container's environment. Defaults to "" (volume's root). SubPathExpr and SubPath are mutually exclusive. */
  subPathExpr?: string
}

/**
 * VolumeMountStatus shows status of volume mounts.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface VolumeMountStatus {
  /** MountPath corresponds to the original VolumeMount. */
  mountPath: string
  /** Name corresponds to the name of the original VolumeMount. */
  name: string
  /** ReadOnly corresponds to the original VolumeMount. */
  readOnly?: boolean
  /** RecursiveReadOnly must be set to Disabled, Enabled, or unspecified (for non-readonly mounts). An IfPossible value in the original VolumeMount must be translated to Disabled or Enabled, depending on the mount result. */
  recursiveReadOnly?: string
}

/**
 * Projection that may be projected along with other supported volume types
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface VolumeProjection {
  /**
   * ClusterTrustBundle allows a pod to access the `.spec.trustBundle` field of ClusterTrustBundle objects in an auto-updating file.
   *
   * **Details**
   *
   * Alpha, gated by the ClusterTrustBundleProjection feature gate.
   *
   * ClusterTrustBundle objects can either be selected by name, or by the combination of signer name and a label selector.
   *
   * Kubelet performs aggressive normalization of the PEM contents written into the pod filesystem.  Esoteric PEM features such as inter-block comments and block headers are stripped.  Certificates are deduplicated. The ordering of certificates within the file is arbitrary, and Kubelet may change the order over time.
   */
  clusterTrustBundle?: ClusterTrustBundleProjection
  /** configMap information about the configMap data to project */
  configMap?: ConfigMapProjection
  /** downwardAPI information about the downwardAPI data to project */
  downwardAPI?: DownwardAPIProjection
  /** secret information about the secret data to project */
  secret?: SecretProjection
  /** serviceAccountToken is information about the serviceAccountToken data to project */
  serviceAccountToken?: ServiceAccountTokenProjection
}

/**
 * VolumeResourceRequirements describes the storage resource requirements for a volume.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface VolumeResourceRequirements {
  /** Limits describes the maximum amount of compute resources allowed. More info: https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/ */
  limits?: {
    [name: string]: Quantity
  }
  /** Requests describes the minimum amount of compute resources required. If Requests is omitted for a container, it defaults to Limits if that is explicitly specified, otherwise to an implementation-defined value. Requests cannot exceed Limits. More info: https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/ */
  requests?: {
    [name: string]: Quantity
  }
}

/**
 * Represents a vSphere volume resource.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface VsphereVirtualDiskVolumeSource {
  /** fsType is filesystem type to mount. Must be a filesystem type supported by the host operating system. Ex. "ext4", "xfs", "ntfs". Implicitly inferred to be "ext4" if unspecified. */
  fsType?: string
  /** storagePolicyID is the storage Policy Based Management (SPBM) profile ID associated with the StoragePolicyName. */
  storagePolicyID?: string
  /** storagePolicyName is the storage Policy Based Management (SPBM) profile name. */
  storagePolicyName?: string
  /** volumePath is the path that identifies vSphere volume vmdk */
  volumePath: string
}

/**
 * The weights of all of the matched WeightedPodAffinityTerm fields are added per-node to find the most preferred node(s)
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface WeightedPodAffinityTerm {
  /** Required. A pod affinity term, associated with the corresponding weight. */
  podAffinityTerm: PodAffinityTerm
  /** weight associated with matching the corresponding podAffinityTerm, in the range 1-100. */
  weight: number
}

/**
 * WindowsSecurityContextOptions contain Windows-specific options and credentials.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface WindowsSecurityContextOptions {
  /** GMSACredentialSpec is where the GMSA admission webhook (https://github.com/kubernetes-sigs/windows-gmsa) inlines the contents of the GMSA credential spec named by the GMSACredentialSpecName field. */
  gmsaCredentialSpec?: string
  /** GMSACredentialSpecName is the name of the GMSA credential spec to use. */
  gmsaCredentialSpecName?: string
  /** HostProcess determines if a container should be run as a 'Host Process' container. All of a Pod's containers must have the same effective HostProcess value (it is not allowed to have a mix of HostProcess containers and non-HostProcess containers). In addition, if HostProcess is true then HostNetwork must also be set to true. */
  hostProcess?: boolean
  /** The UserName in Windows to run the entrypoint of the container process. Defaults to the user specified in image metadata if unspecified. May also be set in PodSecurityContext. If set in both SecurityContext and PodSecurityContext, the value specified in SecurityContext takes precedence. */
  runAsUserName?: string
}

/**
 * FieldsV1 stores a set of fields in a data structure like a Trie, in JSON format.
 *
 * **Details**
 *
 * Each key is either a '.' representing the field itself, and will always map to an empty set, or a string representing a sub-field or item. The string will follow one of these four formats: 'f:<name>', where <name> is the name of a field in a struct, or key in a map 'v:<value>', where <value> is the exact json formatted value of a list item 'i:<index>', where <index> is position of a item in a list 'k:<keys>', where <keys> is a map of  a list item's key fields to their unique values If a key maps to an empty Fields value, the field that key represents is part of the set.
 *
 * The exact format is defined in sigs.k8s.io/structured-merge-diff
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface FieldsV1 {
}

/**
 * A label selector is a label query over a set of resources. The result of matchLabels and matchExpressions are ANDed. An empty label selector matches all objects. A null label selector matches no objects.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface LabelSelector {
  /** matchExpressions is a list of label selector requirements. The requirements are ANDed. */
  matchExpressions?: Array<LabelSelectorRequirement>
  /** matchLabels is a map of {key,value} pairs. A single {key,value} in the matchLabels map is equivalent to an element of matchExpressions, whose key field is "key", the operator is "In", and the values array contains only "value". The requirements are ANDed. */
  matchLabels?: {
    [name: string]: string
  }
}

/**
 * A label selector requirement is a selector that contains values, a key, and an operator that relates the key and values.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface LabelSelectorRequirement {
  /** key is the label key that the selector applies to. */
  key: string
  /** operator represents a key's relationship to a set of values. Valid operators are In, NotIn, Exists and DoesNotExist. */
  operator: string
  /** values is an array of string values. If the operator is In or NotIn, the values array must be non-empty. If the operator is Exists or DoesNotExist, the values array must be empty. This array is replaced during a strategic merge patch. */
  values?: Array<string>
}

/**
 * ManagedFieldsEntry is a workflow-id, a FieldSet and the group version of the resource that the fieldset applies to.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ManagedFieldsEntry {
  /** APIVersion defines the version of this resource that this field set applies to. The format is "group/version" just like the top-level APIVersion field. It is necessary to track the version of a field set because it cannot be automatically converted. */
  apiVersion?: string
  /** FieldsType is the discriminator for the different fields format and version. There is currently only one possible value: "FieldsV1" */
  fieldsType?: string
  /** FieldsV1 holds the first JSON version format as described in the "FieldsV1" type. */
  fieldsV1?: FieldsV1
  /** Manager is an identifier of the workflow managing these fields. */
  manager?: string
  /** Operation is the type of operation which lead to this ManagedFieldsEntry being created. The only valid values for this field are 'Apply' and 'Update'. */
  operation?: string
  /** Subresource is the name of the subresource used to update that object, or empty string if the object was updated through the main resource. The value of this field is used to distinguish between managers, even if they share the same name. For example, a status update will be distinct from a regular update using the same manager name. Note that the APIVersion field is not related to the Subresource field and it always corresponds to the version of the main resource. */
  subresource?: string
  /** Time is the timestamp of when the ManagedFields entry was added. The timestamp will also be updated if a field is added, the manager changes any of the owned fields value or removes a field. The timestamp does not update when a field is removed from the entry because another manager took it over. */
  time?: Time
}

/**
 * ObjectMeta is metadata that all persisted resources must have, which includes all objects users must create.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ObjectMeta {
  /** Annotations is an unstructured key value map stored with a resource that may be set by external tools to store and retrieve arbitrary metadata. They are not queryable and should be preserved when modifying objects. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/annotations */
  annotations?: {
    [name: string]: string
  }
  /**
   * CreationTimestamp is a timestamp representing the server time when this object was created. It is not guaranteed to be set in happens-before order across separate operations. Clients may not set this value. It is represented in RFC3339 form and is in UTC.
   *
   * **Details**
   *
   * Populated by the system. Read-only. Null for lists. More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#metadata
   */
  readonly creationTimestamp?: Time
  /** Number of seconds allowed for this object to gracefully terminate before it will be removed from the system. Only set when deletionTimestamp is also set. May only be shortened. Read-only. */
  readonly deletionGracePeriodSeconds?: number
  /**
   * DeletionTimestamp is RFC 3339 date and time at which this resource will be deleted. This field is set by the server when a graceful deletion is requested by the user, and is not directly settable by a client. The resource is expected to be deleted (no longer visible from resource lists, and not reachable by name) after the time in this field, once the finalizers list is empty. As long as the finalizers list contains items, deletion is blocked. Once the deletionTimestamp is set, this value may not be unset or be set further into the future, although it may be shortened or the resource may be deleted prior to this time. For example, a user may request that a pod is deleted in 30 seconds. The Kubelet will react by sending a graceful termination signal to the containers in the pod. After that 30 seconds, the Kubelet will send a hard termination signal (SIGKILL) to the container and after cleanup, remove the pod from the API. In the presence of network partitions, this object may still exist after this timestamp, until an administrator or automated process can determine the resource is fully terminated. If not set, graceful deletion of the object has not been requested.
   *
   * **Details**
   *
   * Populated by the system when a graceful deletion is requested. Read-only. More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#metadata
   */
  readonly deletionTimestamp?: Time
  /** Must be empty before the object is deleted from the registry. Each entry is an identifier for the responsible component that will remove the entry from the list. If the deletionTimestamp of the object is non-nil, entries in this list can only be removed. Finalizers may be processed and removed in any order.  Order is NOT enforced because it introduces significant risk of stuck finalizers. finalizers is a shared field, any actor with permission can reorder it. If the finalizer list is processed in order, then this can lead to a situation in which the component responsible for the first finalizer in the list is waiting for a signal (field value, external system, or other) produced by a component responsible for a finalizer later in the list, resulting in a deadlock. Without enforced ordering finalizers are free to order amongst themselves and are not vulnerable to ordering changes in the list. */
  finalizers?: Array<string>
  /**
   * GenerateName is an optional prefix, used by the server, to generate a unique name ONLY IF the Name field has not been provided. If this field is used, the name returned to the client will be different than the name passed. This value will also be combined with a unique suffix. The provided value has the same validation rules as the Name field, and may be truncated by the length of the suffix required to make the value unique on the server.
   *
   * **Details**
   *
   * If this field is specified and the generated name exists, the server will return a 409.
   *
   * Applied only if Name is not specified. More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#idempotency
   */
  generateName?: string
  /** A sequence number representing a specific generation of the desired state. Populated by the system. Read-only. */
  readonly generation?: number
  /** Map of string keys and values that can be used to organize and categorize (scope and select) objects. May match selectors of replication controllers and services. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/labels */
  labels?: {
    [name: string]: string
  }
  /** ManagedFields maps workflow-id and version to the set of fields that are managed by that workflow. This is mostly for internal housekeeping, and users typically shouldn't need to set or understand this field. A workflow can be the user's name, a controller's name, or the name of a specific apply path like "ci-cd". The set of fields is always in the version that the workflow used when modifying the object. */
  managedFields?: Array<ManagedFieldsEntry>
  /** Name must be unique within a namespace. Is required when creating resources, although some resources may allow a client to request the generation of an appropriate name automatically. Name is primarily intended for creation idempotence and configuration definition. Cannot be updated. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names#names */
  name?: string
  /**
   * Namespace defines the space within which each name must be unique. An empty namespace is equivalent to the "default" namespace, but "default" is the canonical representation. Not all objects are required to be scoped to a namespace - the value of this field for those objects will be empty.
   *
   * **Details**
   *
   * Must be a DNS_LABEL. Cannot be updated. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/namespaces
   */
  namespace?: string
  /** List of objects depended by this object. If ALL objects in the list have been deleted, this object will be garbage collected. If this object is managed by a controller, then an entry in this list will point to this controller, with the controller field set to true. There cannot be more than one managing controller. */
  ownerReferences?: Array<OwnerReference>
  /**
   * An opaque value that represents the internal version of this object that can be used by clients to determine when objects have changed. May be used for optimistic concurrency, change detection, and the watch operation on a resource or set of resources. Clients must treat these values as opaque and passed unmodified back to the server. They may only be valid for a particular resource or set of resources.
   *
   * **Details**
   *
   * Populated by the system. Read-only. Value must be treated as opaque by clients and . More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#concurrency-control-and-consistency
   */
  readonly resourceVersion?: string
  /** Deprecated: selfLink is a legacy read-only field that is no longer populated by the system. */
  selfLink?: string
  /**
   * UID is the unique in time and space value for this object. It is typically generated by the server on successful creation of a resource and is not allowed to change on PUT operations.
   *
   * **Details**
   *
   * Populated by the system. Read-only. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names#uids
   */
  readonly uid?: string
}

/**
 * OwnerReference contains enough information to let you identify an owning object. An owning object must be in the same namespace as the dependent, or be cluster-scoped, so there is no namespace field.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface OwnerReference {
  /** API version of the referent. */
  apiVersion: string
  /** If true, AND if the owner has the "foregroundDeletion" finalizer, then the owner cannot be deleted from the key-value store until this reference is removed. See https://kubernetes.io/docs/concepts/architecture/garbage-collection/#foreground-deletion for how the garbage collector interacts with this field and enforces the foreground deletion. Defaults to false. To set this field, a user needs "delete" permission of the owner, otherwise 422 (Unprocessable Entity) will be returned. */
  blockOwnerDeletion?: boolean
  /** If true, this reference points to the managing controller. */
  controller?: boolean
  /** Kind of the referent. More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds */
  kind: string
  /** Name of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names#names */
  name: string
  /** UID of the referent. More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names#uids */
  uid: string
}

/**
 * Time is a wrapper around time.Time which supports correct marshaling to YAML and JSON.  Wrappers are provided for many of the factory methods that the time package offers.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Time = string

/**
 * Quantity is a fixed-point representation of a number. It provides convenient marshaling/unmarshaling in JSON and YAML, in addition to String() and AsInt64() accessors.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Quantity = string
