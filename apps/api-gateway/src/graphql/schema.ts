// GraphQL schema definition for the API Gateway
import gql from 'graphql-tag';
import type { DocumentNode } from 'graphql';

export const typeDefs: DocumentNode = gql`
  scalar Date
  type User {
    id: ID!
    email: String!
    firstName: String!
    lastName: String!
    isActive: Boolean!
    createdAt: Date!
    updatedAt: Date!
    roles: [UserRole!]!
  }
  type UserRole {
    userId: ID!
    projectId: ID!
    role: String!
    permissions: [String!]!
  type UserSession {
    sessionToken: "REDACTED",
    expiresAt: Date!
  type AuthPayload {
    user: User!
    accessToken: "REDACTED",
    refreshToken: "REDACTED",
    expiresIn: Int!
  type RefreshPayload {
  type ElementAccess {
    elementId: ID!
    accessLevel: String!
    hasAccess: Boolean!
  type PaginationInfo {
    page: Int!
    limit: Int!
    total: Int!
    totalPages: Int!
    hasNext: Boolean!
    hasPrev: Boolean!
  type UsersConnection {
    users: [User!]!
    pagination: PaginationInfo!
  input LoginInput {
    password: String!
  input RefreshTokenInput {
  input PaginationInput {
    page: Int = 1
    limit: Int = 10
    sortBy: String = "createdAt"
    sortOrder: String = "desc"
  input ElementAccessInput {
  type Query {
    # Current user info
    me: User
    # User management (admin only)
    users(pagination: PaginationInput): UsersConnection!
    user(id: ID!): User
    # Session management
    sessions: [UserSession!]!
    # Access control
    checkElementAccess(input: ElementAccessInput!): ElementAccess!
    # Health check
    health: String!
  type Mutation {
    # Authentication
    login(input: LoginInput!): AuthPayload!
    refreshToken(input: RefreshTokenInput!): RefreshPayload!
    logout: Boolean!
    createUser(input: CreateUserInput!): User!
    updateUser(id: ID!, input: UpdateUserInput!): User!
    deactivateUser(id: ID!): Boolean!
    invalidateSession(sessionId: ID!): Boolean!
    invalidateAllSessions: Boolean!
  input CreateUserInput {
  input UpdateUserInput {
    email: String
    firstName: String
    lastName: String
    isActive: Boolean
  type Subscription {
    # Real-time session updates
    sessionUpdated: UserSession!
    # User status updates
    userStatusChanged: User!
`;
export default typeDefs;
