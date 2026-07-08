import Link from "next/link";
import { Shield } from "lucide-react";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="container mx-auto px-6 py-12">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="flex items-center justify-center mb-4">
              <div className="p-3 rounded-xl bg-primary/10 ring-1 ring-primary/20">
                <Shield className="h-8 w-8 text-primary" />
              </div>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold mb-3">Privacy Policy</h1>
            <p className="text-sm text-muted-foreground">
              <strong>Last Updated:</strong> October 20, 2025
            </p>
          </div>

          {/* Content */}
          <div className="space-y-8">
            <div>
              <h2 className="text-2xl font-semibold mb-4">Introduction</h2>
              <p className="text-muted-foreground">
                MCP Assistant (&quot;we&quot;, &quot;our&quot;, or &quot;the service&quot;) is a platform that helps users manage MCP (Model Context Protocol) servers and interact with AI assistants. This privacy policy explains how we collect, use, and protect your information.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-semibold mb-4">Information We Collect</h2>

              <h3 className="text-xl font-semibold mt-6 mb-3">1. Authentication Information</h3>
              <p className="text-muted-foreground mb-3">
                When you sign in using Google OAuth, we collect:
              </p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                <li>Your email address</li>
                <li>Your profile information (name, profile picture)</li>
                <li>Google user ID</li>
              </ul>
              <p className="text-muted-foreground mt-3">
                This information is used solely for authentication purposes and to provide you with a personalized experience.
              </p>

              <h3 className="text-xl font-semibold mt-6 mb-3">2. MCP Server Configuration</h3>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                <li>Server names, URLs, and connection settings you configure</li>
                <li>This data is stored securely in our database</li>
                <li>Server configurations are private to your account</li>
              </ul>

              <h3 className="text-xl font-semibold mt-6 mb-3">3. Usage Data</h3>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                <li>Connection state and tool discovery data stored temporarily with automatic expiry</li>
                <li>Session information for anonymous users</li>
                <li>No tracking or analytics data is collected</li>
              </ul>
            </div>

            <div>
              <h2 className="text-2xl font-semibold mb-4">How We Use Your Information</h2>
              <p className="text-muted-foreground mb-3">We use the collected information to:</p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                <li>Authenticate you with your Google account</li>
                <li>Maintain your session and preferences</li>
                <li>Store your MCP server configurations</li>
                <li>Provide access to connected MCP servers and AI assistant features</li>
                <li>Manage connection state and tool discovery</li>
              </ul>
            </div>

            <div>
              <h2 className="text-2xl font-semibold mb-4">Data Storage</h2>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                <li><strong>Database:</strong> User accounts and MCP server configurations are stored in our secure database</li>
                <li><strong>Cache:</strong> Connection state and temporary data stored with 24-hour automatic expiry</li>
                <li><strong>Backend Services:</strong> Authentication tokens are securely validated</li>
                <li><strong>No Third-Party Storage:</strong> We do not store your data on third-party servers</li>
              </ul>
            </div>

            <div>
              <h2 className="text-2xl font-semibold mb-4">Data Sharing</h2>
              <p className="text-muted-foreground mb-3">We do <strong>NOT</strong>:</p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                <li>Sell your personal information to third parties</li>
                <li>Share your data with advertisers</li>
                <li>Use your data for marketing purposes</li>
                <li>Track your browsing activity</li>
              </ul>

              <p className="text-muted-foreground mt-4 mb-3">We <strong>MAY</strong> share data only in these circumstances:</p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                <li>When required by law or legal process</li>
                <li>To protect the rights, property, or safety of users or others</li>
                <li>With your explicit consent</li>
              </ul>
            </div>

            <div>
              <h2 className="text-2xl font-semibold mb-4">Third-Party Services</h2>

              <h3 className="text-xl font-semibold mt-6 mb-3">Google OAuth</h3>
              <p className="text-muted-foreground mb-3">We use Google OAuth for authentication. When you sign in:</p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                <li>Google&apos;s Privacy Policy applies: <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">https://policies.google.com/privacy</a></li>
                <li>We receive only the minimum information necessary for authentication</li>
              </ul>

              <h3 className="text-xl font-semibold mt-6 mb-3">MCP Servers</h3>
              <p className="text-muted-foreground mb-3">When you connect to MCP servers:</p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                <li>You are responsible for the privacy policies of those servers</li>
                <li>We do not control or monitor the data exchanged with third-party MCP servers</li>
              </ul>
            </div>

            <div>
              <h2 className="text-2xl font-semibold mb-4">Data Security</h2>
              <p className="text-muted-foreground mb-3">We implement security measures including:</p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                <li>HTTPS encryption for all network communications</li>
                <li>Secure token handling for authentication</li>
                <li>No plaintext storage of sensitive credentials</li>
                <li>OAuth 2.0 industry-standard authentication</li>
                <li>Automatic cleanup and expiry of temporary data</li>
              </ul>
            </div>

            <div>
              <h2 className="text-2xl font-semibold mb-4">Your Rights</h2>
              <p className="text-muted-foreground mb-3">You have the right to:</p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                <li><strong>Access:</strong> Review your stored server configurations and data</li>
                <li><strong>Delete:</strong> Remove your account and all associated data</li>
                <li><strong>Revoke Access:</strong> Disconnect your Google account at any time</li>
                <li><strong>Data Portability:</strong> Export your MCP server configurations</li>
              </ul>
            </div>

            <div>
              <h2 className="text-2xl font-semibold mb-4">Children&apos;s Privacy</h2>
              <p className="text-muted-foreground">
                MCP Assistant is not intended for children under 13. We do not knowingly collect information from children under 13.
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-semibold mb-4">Changes to This Policy</h2>
              <p className="text-muted-foreground mb-3">We may update this privacy policy from time to time. When we do:</p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                <li>The &quot;Last Updated&quot; date will be revised</li>
                <li>Material changes will be communicated through our website</li>
                <li>Continued use of the service constitutes acceptance of changes</li>
              </ul>
            </div>

            <div>
              <h2 className="text-2xl font-semibold mb-4">Data Retention</h2>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                <li><strong>Account Data:</strong> Stored until you delete your account</li>
                <li><strong>Authentication Tokens:</strong> Expire according to Google&apos;s OAuth token lifetime</li>
                <li><strong>Temporary Cache:</strong> Automatically expires after 24 hours</li>
                <li><strong>Session Data:</strong> Cleared when you sign out</li>
              </ul>
            </div>

            <div>
              <h2 className="text-2xl font-semibold mb-4">Compliance</h2>
              <p className="text-muted-foreground mb-3">This service complies with:</p>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
                <li>Google API Services User Data Policy</li>
                <li>General Data Protection Regulation (GDPR) principles</li>
                <li>California Consumer Privacy Act (CCPA) guidelines</li>
              </ul>
            </div>

            {/* Highlight Box */}
            <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900/50 rounded-xl p-6">
              <p className="text-yellow-900 dark:text-yellow-400 font-medium">
                <strong>Your Privacy Matters:</strong> We are committed to protecting your privacy and being transparent about our data practices. MCP Assistant is designed to keep your data secure with no subscriptions required.
              </p>
            </div>
          </div>

          {/* Back to Home */}
          <div className="text-center mt-12">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-primary hover:underline"
            >
              ← Back to Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
