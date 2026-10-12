import { WebhookTesterClient } from "@/components/weblog/webhook-tester-client";

export const metadata = {
  title: "Webhook Simulator | NN Weblog",
  description: "Test Steadfast Webhook API ingress and HMAC-SHA256 signature verification",
};

export default function WebhookTesterPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Steadfast Webhook Simulator
        </h1>
        <p className="text-sm text-slate-500">
          Simulate incoming courier webhook dispatch updates and verify HMAC-SHA256 signatures
        </p>
      </div>

      <WebhookTesterClient />
    </div>
  );
}
