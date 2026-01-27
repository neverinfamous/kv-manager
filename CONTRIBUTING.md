# Contributing to KV Manager

Thank you for your interest in contributing to KV Manager! We welcome contributions from the community and are grateful for your support.

## 🤝 How to Contribute

### Reporting Bugs

If you find a bug, please create an issue using the Bug Report template. Include:

- A clear, descriptive title
- Steps to reproduce the issue
- Expected vs actual behavior
- Your environment (OS, browser, Node.js version)
- Screenshots if applicable
- Any relevant error messages or logs

### Suggesting Features

We love feature requests! Please create an issue using the Feature Request template. Include:

- A clear, descriptive title
- The problem your feature would solve
- Your proposed solution
- Alternative solutions you've considered
- Any additional context or screenshots

### Pull Requests

We actively welcome pull requests! Here's how to contribute code:

1. **Fork the repository** and create your branch from `main`
2. **Make your changes** following our coding standards
3. **Test your changes** thoroughly
4. **Update documentation** if needed
5. **Ensure the build passes** (`npm run build`)
6. **Submit a pull request** using our template

## 🏗️ Development Setup

### Prerequisites

- Node.js 18+ and npm
- Git
- (Optional) Cloudflare account for testing with real KV namespaces

### Getting Started

```bash
# Clone your fork
git clone https://github.com/YOUR-USERNAME/kv-manager.git
cd kv-manager

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Start development server (Terminal 1)
npm run dev

# In a separate terminal, start the Worker (Terminal 2)
npx wrangler dev --config wrangler.dev.toml --local
```

The app will be available at `http://localhost:5173` with the Worker API at `http://localhost:8787`.

## 📋 Coding Standards

### TypeScript

- Use TypeScript for all new code
- Avoid `any` types - use proper typing
- Follow existing patterns in the codebase
- Run `npm run lint` before committing

### React Components

- Use functional components with hooks
- Keep components focused and single-purpose
- Extract reusable logic into custom hooks
- Use TypeScript interfaces for props

### Styling

- Use Tailwind CSS utility classes
- Follow existing design patterns
- Use shadcn/ui components when available
- Maintain responsive design

### Git Commits

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
feat: add namespace search feature
fix: resolve pagination bug in key list
docs: update API documentation
style: format code with prettier
refactor: simplify bulk operations logic
test: add tests for import/export
chore: update dependencies
```

## 🧪 Testing

### Local Development Testing

The Worker provides mock data for local testing:

```bash
npm run dev  # Frontend (Terminal 1)
npx wrangler dev --config wrangler.dev.toml --local  # Worker API (Terminal 2)
```

Test all major features:

- Namespace listing and creation
- Key browsing and editing
- Bulk operations
- Search functionality
- Import/export operations

### Production Testing (Optional)

If you have a Cloudflare account:

```bash
# Deploy to your account
npx wrangler deploy

# Test with real KV namespaces
```

## 📚 Project Structure

```
kv-manager/
├── src/                    # Frontend React app
│   ├── components/         # React components
│   │   ├── ui/            # shadcn/ui components
│   │   └── ...            # Feature components
│   ├── contexts/          # React contexts
│   ├── hooks/             # Custom hooks
│   ├── services/          # API and auth services
│   └── types/             # TypeScript types
├── worker/                # Cloudflare Worker backend
│   ├── routes/            # API route handlers
│   ├── durable-objects/   # Durable Object implementations
│   ├── utils/             # Utilities
│   ├── types/             # TypeScript types
│   └── schema.sql         # D1 metadata schema
├── .github/               # GitHub templates
└── docs/                  # Documentation
```

## 🔍 Review Process

1. **Initial Review**: Maintainers review PRs within 3-5 days
2. **Feedback**: We may request changes or clarifications
3. **Testing**: PRs must pass all checks
4. **Approval**: Requires approval from at least one maintainer
5. **Merge**: Maintainers will merge approved PRs

## 🎯 Good First Issues

Look for issues labeled `good first issue` - these are great for newcomers!

## 🌟 Recognition

Contributors are recognized in:

- GitHub's automatic contributors list
- Release notes for significant contributions
- Our gratitude and appreciation!

## 📞 Getting Help

- **Questions?** Open a Discussion
- **Stuck?** Comment on your PR or issue
- **Need clarification?** Ask in the relevant issue

## 📄 License

By contributing, you agree that your contributions will be licensed under the MIT License.

## 🙏 Thank You

Every contribution, no matter how small, makes KV Manager better for everyone. Thank you for being part of our community!

---

**Made with ❤️ for the Cloudflare community**
