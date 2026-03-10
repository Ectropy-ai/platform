// Staging stub for AWS SDK - provides type definitions but no implementation
export class SecretsManagerClient {
  constructor(config?: any) {
    // Stub constructor
  }

  async send(command: any): Promise<any> {
    // Stub send method - throws error in staging
    throw new Error('AWS Secrets Manager not available in staging environment');
  }
}

export class GetSecretValueCommand {
  constructor(params: any) {
    // Stub constructor
  }
}

export class CreateSecretCommand {
  constructor(params: any) {
    // Stub constructor
  }
}

export class UpdateSecretCommand {
  constructor(params: any) {
    // Stub constructor
  }
}

export class DeleteSecretCommand {
  constructor(params: any) {
    // Stub constructor
  }
}

export class ListSecretsCommand {
  constructor(params?: any) {
    // Stub constructor
  }
}

export class RotateSecretCommand {
  constructor(params: any) {
    // Stub constructor
  }
}

export class DescribeSecretCommand {
  constructor(params: any) {
    // Stub constructor
  }
}

export interface GetSecretValueCommandOutput {
  SecretString?: string;
  SecretBinary?: Uint8Array;
  VersionId?: string;
  VersionStages?: string[];
  ARN?: string;
  Name?: string;
  CreatedDate?: Date;
}

export interface CreateSecretCommandOutput {
  ARN?: string;
  Name?: string;
  VersionId?: string;
}

export interface UpdateSecretCommandOutput {
  ARN?: string;
  Name?: string;
  VersionId?: string;
}

export interface DeleteSecretCommandOutput {
  ARN?: string;
  Name?: string;
  DeletionDate?: Date;
}

export interface ListSecretsCommandOutput {
  SecretList?: Array<{
    ARN?: string;
    Name?: string;
    Description?: string;
    KmsKeyId?: string;
    RotationEnabled?: boolean;
    RotationLambdaARN?: string;
    RotationRules?: any;
    LastRotatedDate?: Date;
    LastChangedDate?: Date;
    LastAccessedDate?: Date;
    DeletedDate?: Date;
    Tags?: Array<{
      Key?: string;
      Value?: string;
    }>;
    SecretVersionsToStages?: Record<string, string[]>;
    OwningService?: string;
    CreatedDate?: Date;
    PrimaryRegion?: string;
  }>;
  NextToken?: string;
}