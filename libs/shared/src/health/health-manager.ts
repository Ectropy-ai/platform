export interface HealthCheck {
  name: string;
  check: () => Promise<boolean>;
  critical: boolean;
  timeout?: number;
}

export class HealthManager {
  private checks: Map<string, HealthCheck> = new Map();

  registerCheck(check: HealthCheck): void {
    this.checks.set(check.name, check);
  }

  async checkHealth(): Promise<{ healthy: boolean; checks: Record<string, boolean> }> {
    const results: Record<string, boolean> = {};
    let healthy = true;

    for (const [name, check] of this.checks) {
      try {
        const timeoutPromise = new Promise<boolean>((resolve) => 
          setTimeout(() => resolve(false), check.timeout || 5000)
        );
        
        results[name] = await Promise.race([check.check(), timeoutPromise]);
        
        if (!results[name] && check.critical) {
          healthy = false;
        }
      } catch (error) {
        results[name] = false;
        if (check.critical) healthy = false;
      }
    }

    return { healthy, checks: results };
  }

  async waitForDependencies(): Promise<void> {
    const criticalChecks = Array.from(this.checks.values()).filter(c => c.critical);
    
    for (const check of criticalChecks) {
      let attempts = 0;
      const maxAttempts = 30;
      
      while (attempts < maxAttempts) {
        if (await check.check()) {
          break;
        }
        
        attempts++;
        if (attempts === maxAttempts) {
          throw new Error(`Critical dependency ${check.name} failed after ${maxAttempts} attempts`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
}