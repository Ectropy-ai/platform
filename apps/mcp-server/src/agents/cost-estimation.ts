/**
 * Cost Estimation Agent
 * Handles material takeoffs, labor calculations, and cost projections for construction projects
 */

import { BaseAgent } from './base-agent.js';

export interface CostEstimationInput {
  projectId?: string;
  ifcData?: any;
  materialList?: Array<{
    type: string;
    quantity: number;
    unit: string;
    specifications?: any;
  }>;
  laborRequirements?: Array<{
    trade: string;
    hours: number;
    skillLevel: string;
  }>;
  location?: {
    region: string;
    city: string;
    zipCode?: string;
  };
}

export interface CostEstimationResult {
  totalCost: number;
  breakdown: {
    materials: number;
    labor: number;
    equipment: number;
    overhead: number;
  };
  materialCosts: Array<{
    type: string;
    quantity: number;
    unit: string;
    unitCost: number;
    totalCost: number;
  }>;
  laborCosts: Array<{
    trade: string;
    hours: number;
    rate: number;
    totalCost: number;
  }>;
  confidence: number; // 0-1 scale
  assumptions: string[];
  recommendations: string[];
}

export class CostEstimationAgent extends BaseAgent {
  private regionalCostData: Map<string, any> = new Map();

  constructor() {
    super();
    this.capabilities = [
      'material_takeoff',
      'labor_estimation',
      'cost_projection',
      'regional_pricing',
      'ifc_cost_analysis',
    ];
    this.loadRegionalCostData();
  }

  getName(): string {
    return 'cost-estimation';
  }

  getDescription(): string {
    return 'Performs material takeoffs, labor calculations, and cost projections for construction projects';
  }

  getCapabilities(): string[] {
    return this.capabilities;
  }

  async process(input: CostEstimationInput): Promise<CostEstimationResult> {
    return this.processWithMetrics(async () => {
      // Process cost estimation
      console.log(
        `💰 Processing cost estimation for ${input.projectId || 'unknown project'}`
      );

      // Initialize cost breakdown
      const breakdown = {
        materials: 0,
        labor: 0,
        equipment: 0,
        overhead: 0,
      };

      const materialCosts: Array<any> = [];
      const laborCosts: Array<any> = [];
      const assumptions: string[] = [];
      const recommendations: string[] = [];

      // Process material costs
      if (input.materialList) {
        for (const material of input.materialList) {
          const materialCost = await this.calculateMaterialCost(
            material,
            input.location
          );
          materialCosts.push(materialCost);
          breakdown.materials += materialCost.totalCost;
        }
      }

      // Process labor costs
      if (input.laborRequirements) {
        for (const labor of input.laborRequirements) {
          const laborCost = await this.calculateLaborCost(
            labor,
            input.location
          );
          laborCosts.push(laborCost);
          breakdown.labor += laborCost.totalCost;
        }
      }

      // Calculate equipment costs (10% of materials + labor)
      breakdown.equipment = (breakdown.materials + breakdown.labor) * 0.1;

      // Calculate overhead (15% of subtotal)
      const subtotal =
        breakdown.materials + breakdown.labor + breakdown.equipment;
      breakdown.overhead = subtotal * 0.15;

      // Calculate total cost
      const totalCost = Object.values(breakdown).reduce(
        (sum, cost) => sum + cost,
        0
      );

      // Add assumptions and recommendations
      assumptions.push('Regional cost data based on latest market rates');
      assumptions.push(
        'Equipment costs estimated at 10% of materials and labor'
      );
      assumptions.push('Overhead costs estimated at 15% of subtotal');

      recommendations.push(
        'Consider bulk purchasing for materials over $10,000'
      );
      recommendations.push('Review labor rates quarterly for accuracy');

      if (totalCost > 100000) {
        recommendations.push('Consider value engineering for high-cost items');
      }

      // Calculate confidence based on data completeness
      const confidence = this.calculateConfidence(
        input,
        materialCosts,
        laborCosts
      );

      return {
        totalCost: Math.round(totalCost * 100) / 100,
        breakdown: {
          materials: Math.round(breakdown.materials * 100) / 100,
          labor: Math.round(breakdown.labor * 100) / 100,
          equipment: Math.round(breakdown.equipment * 100) / 100,
          overhead: Math.round(breakdown.overhead * 100) / 100,
        },
        materialCosts,
        laborCosts,
        confidence,
        assumptions,
        recommendations,
      };
    });
  }

  private async calculateMaterialCost(
    material: any,
    location?: any
  ): Promise<any> {
    // Simulate material cost calculation with regional adjustments
    const baseCosts: Record<string, number> = {
      concrete: 120, // per cubic yard
      steel: 0.65, // per pound
      lumber: 450, // per thousand board feet
      drywall: 1.2, // per square foot
      insulation: 1.5, // per square foot
      roofing: 3.5, // per square foot
      electrical: 2.5, // per linear foot
      plumbing: 8.0, // per linear foot
    };

    const materialType = material.type.toLowerCase();
    const baseUnitCost = baseCosts[materialType] || 10.0; // Default cost

    // Apply regional cost adjustment
    const regionalMultiplier = this.getRegionalCostMultiplier(location);
    const unitCost = baseUnitCost * regionalMultiplier;

    return {
      type: material.type,
      quantity: material.quantity,
      unit: material.unit,
      unitCost: Math.round(unitCost * 100) / 100,
      totalCost: Math.round(material.quantity * unitCost * 100) / 100,
    };
  }

  private async calculateLaborCost(labor: any, location?: any): Promise<any> {
    // Simulate labor cost calculation with regional and skill level adjustments
    const baseLaborRates: Record<string, number> = {
      general: 25, // per hour
      carpenter: 35, // per hour
      electrician: 45, // per hour
      plumber: 50, // per hour
      hvac: 42, // per hour
      mason: 40, // per hour
      roofer: 32, // per hour
      painter: 28, // per hour
    };

    const skillMultipliers: Record<string, number> = {
      apprentice: 0.7,
      journeyman: 1.0,
      master: 1.4,
      foreman: 1.6,
    };

    const tradeType = labor.trade.toLowerCase();
    const baseRate = baseLaborRates[tradeType] || 30.0; // Default rate

    // Apply skill level and regional adjustments
    const skillMultiplier =
      skillMultipliers[labor.skillLevel?.toLowerCase()] || 1.0;
    const regionalMultiplier = this.getRegionalCostMultiplier(location);
    const rate = baseRate * skillMultiplier * regionalMultiplier;

    return {
      trade: labor.trade,
      hours: labor.hours,
      rate: Math.round(rate * 100) / 100,
      totalCost: Math.round(labor.hours * rate * 100) / 100,
    };
  }

  private getRegionalCostMultiplier(location?: any): number {
    if (!location) {
      return 1.0;
    }

    // Simulate regional cost adjustments
    const regionalMultipliers: Record<string, number> = {
      new_york: 1.35,
      california: 1.3,
      massachusetts: 1.25,
      washington: 1.2,
      illinois: 1.1,
      texas: 1.05,
      florida: 1.0,
      georgia: 0.95,
      ohio: 0.9,
      midwest: 0.85,
    };

    const region = location.region?.toLowerCase().replace(' ', '_');
    return regionalMultipliers[region] || 1.0;
  }

  private calculateConfidence(
    input: CostEstimationInput,
    materialCosts: any[],
    laborCosts: any[]
  ): number {
    let confidence = 0.5; // Base confidence

    // Increase confidence based on data completeness
    if (input.materialList && input.materialList.length > 0) {
      confidence += 0.2;
    }
    if (input.laborRequirements && input.laborRequirements.length > 0) {
      confidence += 0.2;
    }
    if (input.location) {
      confidence += 0.1;
    }
    if (input.ifcData) {
      confidence += 0.1;
    }

    // Adjust based on cost estimation quality
    if (materialCosts.length > 5) {
      confidence += 0.05;
    }
    if (laborCosts.length > 3) {
      confidence += 0.05;
    }

    return Math.min(confidence, 1.0);
  }

  private loadRegionalCostData(): void {
    // Load regional cost multipliers and market data
    // In a real implementation, this would load from a database or external API
  }

  async initialize(): Promise<void> {
    await super.initialize();
    await this.loadRegionalCostData();
    console.log(
      '💰 Cost Estimation Agent ready for material takeoffs and cost projections'
    );
  }
}
