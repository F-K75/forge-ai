# Contributing to Forge AI

Thank you for your interest in contributing to Forge AI! We welcome contributions from the community.

## Code of Conduct

Be respectful, inclusive, and constructive. Harassment of any kind will not be tolerated.

## How to Contribute

### Reporting Bugs
1. Check existing issues to avoid duplicates
2. Use the Bug Report template
3. Include clear reproduction steps and environment details

### Suggesting Features
1. Use the Feature Request template
2. Explain the problem you're solving
3. Describe the value to users

### Code Contributions

#### Getting Started
```bash
git clone https://github.com/F-K75/forge-ai.git
cd forge-ai
cp .env.example .env
# Configure your .env with required keys
```

#### Development Setup
```bash
# Backend
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Frontend
cd frontend
npm install

# Docker (full stack)
docker compose up
```

#### Making Changes
1. Create a feature branch: `git checkout -b feature/your-feature`
2. Make your changes
3. Run tests:
   ```bash
   cd backend && pytest
   cd frontend && npm run build
   ```
4. Ensure lint passes: `ruff check`
5. Commit with clear messages

#### Pull Request Process
1. Update documentation if needed
2. Add tests for new functionality
3. Ensure CI passes
4. Request review from maintainers

## Development Guidelines

### Code Style
- Python: Follow PEP 8, use type hints
- TypeScript: Follow project ESLint config
- Use meaningful variable names
- Write docstrings for public APIs

### Testing
- Backend: pytest with coverage (minimum 60%)
- Frontend: Vitest
- New features require tests
- Bug fixes require regression tests

## Questions?

Open a Discussion or join our [Discord](https://discord.gg/forge-ai) (coming soon).