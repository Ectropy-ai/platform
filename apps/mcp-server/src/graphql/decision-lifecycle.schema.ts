/**
 * Decision Lifecycle Combined Schema
 *
 * Merges all Decision Lifecycle GraphQL type definitions into a single schema.
 * This is the M4 GraphQL API for the Decision Lifecycle feature.
 *
 * @module graphql/decision-lifecycle.schema
 * @version 1.0.0
 */

import { gql } from 'graphql-tag';
import { decisionTypeDefs } from './decision/decision.schema.js';
import { voxelTypeDefs } from './voxel/voxel.schema.js';
import { inspectionTypeDefs } from './inspection/inspection.schema.js';
import { consequenceTypeDefs } from './consequence/consequence.schema.js';
import { scheduleTypeDefs } from './schedule/schedule.schema.js';
import { authorityTypeDefs } from './authority/authority.schema.js';

/**
 * Base types shared across all Decision Lifecycle schemas
 */
export const baseTypeDefs = gql`
  # ==============================================================================
  # Scalars
  # ==============================================================================

  scalar DateTime
  scalar JSON

  # ==============================================================================
  # Base Types (shared across schemas)
  # ==============================================================================

  # Project type (referenced from Prisma)
  type Project {
    id: ID!
    name: String!
    status: String!
    tenantId: ID
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  # User type (referenced from Prisma)
  type User {
    id: ID!
    name: String!
    email: String!
    tenantId: ID
    isPlatformAdmin: Boolean!
  }

  # Root Query type (extended by other schemas)
  type Query {
    _empty: String
  }

  # Root Mutation type (extended by other schemas)
  type Mutation {
    _empty: String
  }

  # Root Subscription type (extended by other schemas)
  type Subscription {
    _empty: String
  }
`;

/**
 * Combined Decision Lifecycle type definitions
 */
export const decisionLifecycleTypeDefs = [
  baseTypeDefs,
  decisionTypeDefs,
  voxelTypeDefs,
  inspectionTypeDefs,
  consequenceTypeDefs,
  scheduleTypeDefs,
  authorityTypeDefs,
];

export default decisionLifecycleTypeDefs;
