# KV Manager for Cloudflare

[![GitHub](https://img.shields.io/badge/GitHub-neverinfamous/kv--manager-blue?logo=github)](https://github.com/neverinfamous/kv-manager)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
![Version](https://img.shields.io/badge/version-v1.0.0-yellow)
![Status](https://img.shields.io/badge/status-In%20Development-orange)

**Tech Stack:** React 19.2.0 | Vite 7.1.12 | TypeScript 5.9.3 | Tailwind CSS | shadcn/ui | Cloudflare Workers + Zero Trust

A modern, full-featured web application for managing Cloudflare Workers KV namespaces with enterprise-grade authentication via Cloudflare Access (Zero Trust). Following the architecture and patterns of the D1 Database Manager and R2 Bucket Manager.

---

## 🚧 Development Status

**This project is currently in active development.** Features are being implemented according to the [development plan](kv-manager-plan.md).

### Planned Features

- 🗂️ **Namespace Management** - Create, rename, delete, and browse KV namespaces
- 🔑 **Key Management** - Full CRUD operations with pagination and prefix filtering
- ✏️ **Value Editor** - JSON/text editor with syntax highlighting
- 🏷️ **Metadata & Tags** - Custom tags and searchable metadata stored in D1
- 🔍 **Advanced Search** - Cross-namespace search with filters
- 📦 **Bulk Operations** - Multi-select operations orchestrated by Durable Objects
- 💾 **Backup & Restore** - Single-version backup for undo capability
- 📥 **Import & Export** - JSON/NDJSON/CSV format support
- 📊 **Audit Logging** - Track all operations with user attribution
- 🌓 **Theme Support** - Dark/light/system themes
- 🔐 **Enterprise Auth** - GitHub SSO via Cloudflare Access

---

## 📋 Project Plan

For complete project specifications, architecture details, and implementation roadmap, see [kv-manager-plan.md](kv-manager-plan.md).

---

## 🏗️ Architecture

Similar to D1 Manager and R2 Manager:

- **Frontend**: React 19.2.0 + TypeScript 5.9.3 + Vite 7.1.12 + Tailwind CSS + shadcn/ui
- **Backend**: Cloudflare Workers + KV + D1 (metadata) + Durable Objects (orchestration)
- **Auth**: Cloudflare Access (Zero Trust)

---

## 🤝 Contributing

This project is in active development. Contributions will be welcome once the initial implementation is complete. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

## 📞 Support

- 🐛 **Bug Reports:** [GitHub Issues](https://github.com/neverinfamous/kv-manager/issues)
- 💡 **Feature Requests:** [GitHub Discussions](https://github.com/neverinfamous/kv-manager/discussions)

---

**Made with ❤️ for the Cloudflare community**

