import { createLogger, Logger } from '../services/logger.js';

export interface User {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
  role: UserRole;
  preferences?: UserPreferences;
  createdAt: Date;
  lastActiveAt?: Date;
}

export type UserRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface UserPreferences {
  notifications?: {
    email?: boolean;
    push?: boolean;
    inApp?: boolean;
  };
  theme?: 'light' | 'dark' | 'auto';
  language?: string;
}

export interface Team {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  members: TeamMember[];
  createdAt: Date;
  updatedAt: Date;
  settings?: TeamSettings;
}

export interface TeamMember {
  userId: string;
  role: UserRole;
  joinedAt: Date;
  invitedBy?: string;
}

export interface TeamSettings {
  allowPublicProjects?: boolean;
  requireApproval?: boolean;
  defaultRole?: UserRole;
}

export interface Project {
  id: string;
  teamId: string;
  name: string;
  description?: string;
  ownerId: string;
  collaborators: Collaborator[];
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, any>;
}

export interface Collaborator {
  userId: string;
  role: ProjectRole;
  addedAt: Date;
  addedBy: string;
}

export type ProjectRole = 'owner' | 'editor' | 'viewer';

export interface Session {
  id: string;
  projectId: string;
  participants: SessionParticipant[];
  createdAt: Date;
  endedAt?: Date;
  status: 'active' | 'ended';
}

export interface SessionParticipant {
  userId: string;
  joinedAt: Date;
  lastActivityAt: Date;
  cursor?: CursorPosition;
  selections?: Selection[];
}

export interface CursorPosition {
  line: number;
  column: number;
  file?: string;
}

export interface Selection {
  start: { line: number; column: number };
  end: { line: number; column: number };
  file: string;
}

export interface Permission {
  resource: string;
  actions: string[];
}

export interface RBACConfig {
  roles: Map<UserRole, RolePermissions>;
}

export interface RolePermissions {
  teamPermissions: Permission[];
  projectPermissions: Permission[];
}

export interface AuditLogEntry {
  id: string;
  timestamp: Date;
  userId: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: Record<string, any>;
  ip?: string;
}

export interface ActivityEvent {
  id: string;
  type: ActivityType;
  userId: string;
  projectId?: string;
  timestamp: Date;
  data: Record<string, any>;
}

export type ActivityType =
  | 'project_created'
  | 'project_deleted'
  | 'member_added'
  | 'member_removed'
  | 'member_role_changed'
  | 'collaborator_added'
  | 'collaborator_removed'
  | 'session_started'
  | 'session_ended'
  | 'file_edited'
  | 'setting_changed';

export class CollaborationManager {
  private logger: Logger;
  private users: Map<string, User> = new Map();
  private teams: Map<string, Team> = new Map();
  private projects: Map<string, Project> = new Map();
  private sessions: Map<string, Session> = new Map();
  private auditLog: AuditLogEntry[] = [];
  private maxAuditLogSize = 10000;

  constructor() {
    this.logger = createLogger('CollaborationManager');
    this.initializeRBAC();
  }

  public async createUser(userData: Partial<User>): Promise<User> {
    const user: User = {
      id: this.generateId('user'),
      name: userData.name || 'Unknown',
      email: userData.email,
      avatar: userData.avatar,
      role: userData.role || 'member',
      preferences: userData.preferences || {},
      createdAt: new Date()
    };

    this.users.set(user.id, user);
    this.logAudit(user.id, 'user_created', 'user', user.id);

    this.logger.info({ userId: user.id }, 'User created');
    return user;
  }

  public async getUser(userId: string): Promise<User | null> {
    return this.users.get(userId) || null;
  }

  public async updateUser(userId: string, updates: Partial<User>): Promise<User> {
    const user = this.users.get(userId);

    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    const updatedUser: User = {
      ...user,
      ...updates,
      id: user.id,
      createdAt: user.createdAt
    };

    this.users.set(userId, updatedUser);
    this.logAudit(userId, 'user_updated', 'user', userId);

    return updatedUser;
  }

  public async createTeam(ownerId: string, teamData: Partial<Team>): Promise<Team> {
    const owner = this.users.get(ownerId);
    if (!owner) {
      throw new Error(`Owner not found: ${ownerId}`);
    }

    const team: Team = {
      id: this.generateId('team'),
      name: teamData.name || 'New Team',
      description: teamData.description,
      ownerId,
      members: [
        {
          userId: ownerId,
          role: 'owner',
          joinedAt: new Date()
        }
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
      settings: teamData.settings
    };

    this.teams.set(team.id, team);
    this.logAudit(ownerId, 'team_created', 'team', team.id);

    this.logger.info({ teamId: team.id, ownerId }, 'Team created');
    return team;
  }

  public async getTeam(teamId: string): Promise<Team | null> {
    return this.teams.get(teamId) || null;
  }

  public async addTeamMember(
    teamId: string,
    userId: string,
    role: UserRole,
    invitedBy: string
  ): Promise<void> {
    const team = this.teams.get(teamId);

    if (!team) {
      throw new Error(`Team not found: ${teamId}`);
    }

    if (team.members.some(m => m.userId === userId)) {
      throw new Error(`User already is a member: ${userId}`);
    }

    team.members.push({
      userId,
      role,
      joinedAt: new Date(),
      invitedBy
    });

    team.updatedAt = new Date();
    this.teams.set(teamId, team);

    this.logAudit(invitedBy, 'member_added', 'team', teamId, { userId, role });
    this.logger.info({ teamId, userId, role }, 'Member added to team');
  }

  public async removeTeamMember(teamId: string, userId: string, removedBy: string): Promise<void> {
    const team = this.teams.get(teamId);

    if (!team) {
      throw new Error(`Team not found: ${teamId}`);
    }

    if (userId === team.ownerId) {
      throw new Error('Cannot remove team owner');
    }

    team.members = team.members.filter(m => m.userId !== userId);
    team.updatedAt = new Date();
    this.teams.set(teamId, team);

    this.logAudit(removedBy, 'member_removed', 'team', teamId, { userId });
    this.logger.info({ teamId, userId }, 'Member removed from team');
  }

  public async updateMemberRole(
    teamId: string,
    userId: string,
    newRole: UserRole,
    updatedBy: string
  ): Promise<void> {
    const team = this.teams.get(teamId);

    if (!team) {
      throw new Error(`Team not found: ${teamId}`);
    }

    const member = team.members.find(m => m.userId === userId);
    if (!member) {
      throw new Error(`Member not found: ${userId}`);
    }

    member.role = newRole;
    team.updatedAt = new Date();
    this.teams.set(teamId, team);

    this.logAudit(updatedBy, 'member_role_changed', 'team', teamId, { userId, newRole });
    this.logger.info({ teamId, userId, newRole }, 'Member role updated');
  }

  public async createProject(
    teamId: string,
    ownerId: string,
    projectData: Partial<Project>
  ): Promise<Project> {
    const team = this.teams.get(teamId);
    if (!team) {
      throw new Error(`Team not found: ${teamId}`);
    }

    if (!this.hasPermission(ownerId, teamId, 'project', 'create')) {
      throw new Error('Permission denied: Cannot create project');
    }

    const project: Project = {
      id: this.generateId('project'),
      teamId,
      name: projectData.name || 'New Project',
      description: projectData.description,
      ownerId,
      collaborators: [
        {
          userId: ownerId,
          role: 'owner',
          addedAt: new Date(),
          addedBy: ownerId
        }
      ],
      isPublic: projectData.isPublic || false,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: projectData.metadata
    };

    this.projects.set(project.id, project);
    this.logAudit(ownerId, 'project_created', 'project', project.id);

    this.logger.info({ projectId: project.id, teamId }, 'Project created');
    return project;
  }

  public async getProject(projectId: string): Promise<Project | null> {
    return this.projects.get(projectId) || null;
  }

  public async addCollaborator(
    projectId: string,
    userId: string,
    role: ProjectRole,
    addedBy: string
  ): Promise<void> {
    const project = this.projects.get(projectId);

    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    if (project.collaborators.some(c => c.userId === userId)) {
      throw new Error(`User already is a collaborator: ${userId}`);
    }

    project.collaborators.push({
      userId,
      role,
      addedAt: new Date(),
      addedBy
    });

    project.updatedAt = new Date();
    this.projects.set(projectId, project);

    this.logAudit(addedBy, 'collaborator_added', 'project', projectId, { userId, role });
    this.logger.info({ projectId, userId, role }, 'Collaborator added');
  }

  public async removeCollaborator(
    projectId: string,
    userId: string,
    removedBy: string
  ): Promise<void> {
    const project = this.projects.get(projectId);

    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    project.collaborators = project.collaborators.filter(c => c.userId !== userId);
    project.updatedAt = new Date();
    this.projects.set(projectId, project);

    this.logAudit(removedBy, 'collaborator_removed', 'project', projectId, { userId });
    this.logger.info({ projectId, userId }, 'Collaborator removed');
  }

  public async createSession(projectId: string, userId: string): Promise<Session> {
    const project = this.projects.get(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    const session: Session = {
      id: this.generateId('session'),
      projectId,
      participants: [
        {
          userId,
          joinedAt: new Date(),
          lastActivityAt: new Date()
        }
      ],
      createdAt: new Date(),
      status: 'active'
    };

    this.sessions.set(session.id, session);
    this.logAudit(userId, 'session_started', 'session', session.id);

    this.logger.info({ sessionId: session.id, projectId }, 'Collaboration session started');
    return session;
  }

  public async joinSession(sessionId: string, userId: string): Promise<void> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (session.status !== 'active') {
      throw new Error('Session has ended');
    }

    if (!session.participants.some(p => p.userId === userId)) {
      session.participants.push({
        userId,
        joinedAt: new Date(),
        lastActivityAt: new Date()
      });
    }

    this.sessions.set(sessionId, session);
    this.logger.info({ sessionId, userId }, 'User joined session');
  }

  public async leaveSession(sessionId: string, userId: string): Promise<void> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.participants = session.participants.filter(p => p.userId !== userId);

    if (session.participants.length === 0) {
      session.status = 'ended';
      session.endedAt = new Date();
    }

    this.sessions.set(sessionId, session);
    this.logAudit(userId, 'session_ended', 'session', sessionId);

    this.logger.info({ sessionId, userId }, 'User left session');
  }

  public async updateCursorPosition(
    sessionId: string,
    userId: string,
    cursor: CursorPosition
  ): Promise<void> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const participant = session.participants.find(p => p.userId === userId);
    if (participant) {
      participant.cursor = cursor;
      participant.lastActivityAt = new Date();
      this.sessions.set(sessionId, session);
    }
  }

  public async endSession(sessionId: string, endedBy: string): Promise<void> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.status = 'ended';
    session.endedAt = new Date();
    this.sessions.set(sessionId, session);

    this.logAudit(endedBy, 'session_ended', 'session', sessionId);
    this.logger.info({ sessionId }, 'Session ended');
  }

  public async getActiveSessions(projectId: string): Promise<Session[]> {
    const sessions: Session[] = [];

    for (const session of this.sessions.values()) {
      if (session.projectId === projectId && session.status === 'active') {
        sessions.push(session);
      }
    }

    return sessions;
  }

  public hasPermission(
    userId: string,
    resourceId: string,
    resourceType: 'team' | 'project',
    action: string
  ): boolean {
    if (resourceType === 'team') {
      const team = this.teams.get(resourceId);
      if (!team) return false;

      const member = team.members.find(m => m.userId === userId);
      if (!member) return false;

      const rolePermissions = this.getRolePermissions(member.role);
      return rolePermissions.teamPermissions.some(
        p => p.resource === resourceType && p.actions.includes(action)
      );
    }

    if (resourceType === 'project') {
      const project = this.projects.get(resourceId);
      if (!project) return false;

      const collaborator = project.collaborators.find(c => c.userId === userId);
      if (!collaborator) return false;

      const rolePermissions = this.getRolePermissions(collaborator.role as UserRole);
      return rolePermissions.projectPermissions.some(
        p => p.resource === resourceType && p.actions.includes(action)
      );
    }

    return false;
  }

  public getAuditLog(
    filters?: {
      userId?: string;
      resource?: string;
      resourceId?: string;
      startDate?: Date;
      endDate?: Date;
    },
    limit?: number
  ): AuditLogEntry[] {
    let entries = [...this.auditLog];

    if (filters?.userId) {
      entries = entries.filter(e => e.userId === filters.userId);
    }

    if (filters?.resource) {
      entries = entries.filter(e => e.resource === filters.resource);
    }

    if (filters?.resourceId) {
      entries = entries.filter(e => e.resourceId === filters.resourceId);
    }

    if (filters?.startDate) {
      entries = entries.filter(e => e.timestamp >= filters.startDate!);
    }

    if (filters?.endDate) {
      entries = entries.filter(e => e.timestamp <= filters.endDate!);
    }

    entries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (limit) {
      entries = entries.slice(0, limit);
    }

    return entries;
  }

  private initializeRBAC(): void {
  }

  private getRolePermissions(role: UserRole): RolePermissions {
    const permissions: Record<UserRole, RolePermissions> = {
      owner: {
        teamPermissions: [
          { resource: 'team', actions: ['*'] },
          { resource: 'project', actions: ['*'] }
        ],
        projectPermissions: [
          { resource: 'project', actions: ['*'] }
        ]
      },
      admin: {
        teamPermissions: [
          { resource: 'team', actions: ['read', 'update'] },
          { resource: 'project', actions: ['*'] }
        ],
        projectPermissions: [
          { resource: 'project', actions: ['*'] }
        ]
      },
      member: {
        teamPermissions: [
          { resource: 'team', actions: ['read'] },
          { resource: 'project', actions: ['create'] }
        ],
        projectPermissions: [
          { resource: 'project', actions: ['read', 'update'] }
        ]
      },
      viewer: {
        teamPermissions: [
          { resource: 'team', actions: ['read'] }
        ],
        projectPermissions: [
          { resource: 'project', actions: ['read'] }
        ]
      }
    };

    return permissions[role] || permissions.viewer;
  }

  private logAudit(
    userId: string,
    action: string,
    resource: string,
    resourceId?: string,
    details?: Record<string, any>
  ): void {
    const entry: AuditLogEntry = {
      id: this.generateId('audit'),
      timestamp: new Date(),
      userId,
      action,
      resource,
      resourceId,
      details
    };

    this.auditLog.push(entry);

    if (this.auditLog.length > this.maxAuditLogSize) {
      this.auditLog.shift();
    }
  }

  private generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}

export default CollaborationManager;
