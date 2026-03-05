import Link from "next/link";
import { Mail, Github, Bug, Shield, Server, Code, BookOpen } from "lucide-react";

export default function Footer() {
  return (
    <footer className="relative max-w-5xl mx-auto border-t border-border/50 bg-background/50 backdrop-blur-sm">
      <div className="container mx-auto px-6 py-12">
        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
          {/* Brand */}
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-foreground">MCP Assistant</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Simplifying interaction with any remote MCP            </p>
          </div>

          {/* Quick Links */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-foreground uppercase tracking-wider">Quick Links</h4>
            <div className="flex flex-col space-y-2">
              <Link href="/mcp" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors">
                <Server className="h-4 w-4 flex-shrink-0" />
                MCP Servers
              </Link>
              <Link href="/playground" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors">
                <Code className="h-4 w-4 flex-shrink-0" />
                Playground
              </Link>
              <a
                href="https://github.com/zonlabs/mcp-assistant"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                <Github className="h-4 w-4 flex-shrink-0" />
                GitHub Repository
              </a>
              <a
                href="https://github.com/zonlabs/mcp-assistant/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                <Bug className="h-4 w-4 flex-shrink-0" />
                Report an Issue
              </a>
            </div>
          </div>

          {/* Legal & Resources */}
          <div className="space-y-8">
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-foreground uppercase tracking-wider">Legal</h4>
              <div className="flex flex-col space-y-2">
                <Link href="/privacy" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors">
                  <Shield className="h-4 w-4 flex-shrink-0" />
                  Privacy Policy
                </Link>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-foreground uppercase tracking-wider">Resources</h4>
              <div className="flex flex-col space-y-2">
                <a
                  href="https://docs.ag-ui.com/introduction"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  <BookOpen className="h-4 w-4 flex-shrink-0" />
                  AG-UI Docs
                </a>
                <a
                  href="https://modelcontextprotocol.io/docs/getting-started/intro"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  <BookOpen className="h-4 w-4 flex-shrink-0" />
                  MCP Docs
                </a>
              </div>
            </div>
          </div>

          {/* Contact */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-foreground uppercase tracking-wider">Contact</h4>
            <div className="flex flex-col space-y-2">
              <p className="text-sm text-muted-foreground">Himanshu Mehta</p>
              <a
                href="mailto:himanshu.mehta.sde@gmail.com"
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                <Mail className="h-4 w-4 flex-shrink-0" />
                himanshu.mehta.sde@gmail.com
              </a>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-6 border-t border-border/30 flex flex-col md:flex-row items-center justify-center gap-4">
          <p className="text-sm text-muted-foreground text-center">
            © {new Date().getFullYear()} MCP Assistant. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
