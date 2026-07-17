export const env = {
  APP_BASE_URL: "http://127.0.0.1:3000",
  DEV_AUTH_ENABLED: "false",
  ADMIN_EMAILS: "",
  COACH_EMAILS: "",
  VIDEO_EMAIL_FROM: "",
};

export class WorkflowEntrypoint<Environment = unknown, Params = unknown> {
  env: Environment;

  constructor(ctx?: unknown, env?: Environment) {
    void ctx;
    this.env = (env ?? {}) as Environment;
  }

  async run(event: { payload?: Params; params?: Params }, step: unknown): Promise<void> {
    void event;
    void step;
  }
}
