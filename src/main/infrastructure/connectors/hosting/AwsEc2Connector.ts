import { runCli, VmProvisioningConnector, type ProvisionResult } from './vmProvisioning';

/**
 * Real AWS EC2 connector. Provisions a plain EC2 instance via the standard
 * `aws` CLI (same one AwsCliConnector/AwsElasticBeanstalkConnector already
 * use), waits for it to reach the running state, then deploys to it over
 * SSH + Docker exactly like DockerVpsConnector. Requires an EC2 key pair
 * that already exists in your AWS account (`aws ec2 import-key-pair` or the
 * console) — EC2's run-instances API has no inline-public-key injection the
 * way GCE/Azure do, so this connector never invents one; you attach your
 * key pair name via AWS_EC2_KEY_NAME.
 */
export class AwsEc2Connector extends VmProvisioningConnector {
  readonly id = 'awsEc2' as const;
  readonly displayName = 'AWS EC2';

  constructor(
    private amiId: string | undefined,
    private instanceType: string = 't3.micro',
    private keyName: string | undefined,
    private securityGroupId: string | undefined,
    private subnetId: string | undefined,
    private region: string = 'us-east-1',
    imageName: string | undefined,
    containerName: string | undefined,
    portMapping: string = '80:80',
    sshUser: string = 'ubuntu'
  ) {
    super(imageName, containerName, portMapping, sshUser);
  }

  isConfigured(): boolean {
    return Boolean(this.amiId && this.keyName);
  }

  notConfigured(): { ok: false; reason: string } {
    return { ok: false, reason: 'AWS EC2 is not configured. Set AWS_EC2_AMI_ID and AWS_EC2_KEY_NAME (an existing EC2 key pair), and make sure `aws configure`/`aws sso login` has been run.' };
  }

  async provision(): Promise<ProvisionResult> {
    const args = [
      'ec2', 'run-instances',
      '--image-id', this.amiId as string,
      '--instance-type', this.instanceType,
      '--key-name', this.keyName as string,
      '--region', this.region,
      '--min-count', '1', '--max-count', '1',
      '--output', 'json',
    ];
    if (this.securityGroupId) args.push('--security-group-ids', this.securityGroupId);
    if (this.subnetId) args.push('--subnet-id', this.subnetId);

    const launch = await runCli('aws', args);
    if (!launch.ok) return { ok: false, reason: `aws ec2 run-instances failed: ${launch.message}` };
    let instanceId: string;
    try {
      const data = JSON.parse(launch.stdout) as { Instances?: Array<{ InstanceId: string }> };
      const first = data.Instances?.[0];
      if (!first) return { ok: false, reason: 'aws ec2 run-instances returned no instance.' };
      instanceId = first.InstanceId;
    } catch {
      return { ok: false, reason: 'Could not parse aws ec2 run-instances output.' };
    }

    const wait = await runCli('aws', ['ec2', 'wait', 'instance-running', '--instance-ids', instanceId, '--region', this.region], 10 * 60 * 1000);
    if (!wait.ok) return { ok: false, reason: `Instance ${instanceId} did not reach "running" in time: ${wait.message}` };

    const describe = await runCli('aws', ['ec2', 'describe-instances', '--instance-ids', instanceId, '--region', this.region, '--output', 'json']);
    if (!describe.ok) return { ok: false, reason: `aws ec2 describe-instances failed: ${describe.message}` };
    try {
      const data = JSON.parse(describe.stdout) as { Reservations?: Array<{ Instances: Array<{ PublicIpAddress?: string }> }> };
      const publicIp = data.Reservations?.[0]?.Instances?.[0]?.PublicIpAddress;
      if (!publicIp) return { ok: false, reason: `EC2 instance ${instanceId} is running but has no public IP address (check that its subnet auto-assigns one).` };
      return { ok: true, instanceId, publicIp, region: this.region, size: this.instanceType };
    } catch {
      return { ok: false, reason: 'Could not parse aws ec2 describe-instances output.' };
    }
  }
}
