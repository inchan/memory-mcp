# Deployment Guide

This document describes the deployment process for Zettel Memory.

## Pre-deployment Checklist

Before deploying a new version, ensure:

- [ ] All tests pass: `npm test`
- [ ] Build succeeds: `npm run build`
- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] CHANGELOG.md is updated with release notes
- [ ] Version numbers are consistent across all packages
- [ ] README.md reflects current features
- [ ] Local testing completed with real vault

## Version Strategy

We use semantic versioning with pre-release tags:

- **Alpha releases**: `0.1.0-alpha.0`, `0.1.0-alpha.1`, etc. (early testing)
- **Beta releases**: `0.1.0-beta.0`, `0.1.0-beta.1`, etc. (feature complete)
- **Stable releases**: `0.1.0`, `0.2.0`, `1.0.0`, etc. (production ready)

### Current Release: v0.0.1

This is the first public release with complete CRUD functionality and FTS5 search.

## Automated Deployment (Recommended)

The project uses GitHub Actions for automated deployment to npm when changes are merged to the `release` branch.

### Setup GitHub Actions Deployment

#### 1. Create npm Access Token

1. Login to npm: https://www.npmjs.com/
2. Go to **Access Tokens** in your account settings
3. Click **Generate New Token** → **Classic Token**
4. Select type: **Automation** (for CI/CD)
5. Copy the token (you won't see it again!)

#### 2. Add NPM_TOKEN to GitHub Secrets

1. Go to your GitHub repository settings
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Name: `NPM_TOKEN`
5. Value: Paste your npm token
6. Click **Add secret**

#### 3. Deploy by Merging to Release Branch

Once the secret is configured, deployment is automatic:

```bash
# 1. Update version in package.json
cd packages/mcp-server
# Edit package.json to bump version (e.g., 0.1.0-alpha.0 → 0.1.0-alpha.1)

# 2. Update CHANGELOG.md with release notes

# 3. Commit changes
git add packages/mcp-server/package.json CHANGELOG.md
git commit -m "chore: release v0.1.0-alpha.1"

# 4. Push to release branch (or merge PR to release)
git push origin release
```

**What happens automatically:**
1. GitHub Actions runs tests, linting, type checking
2. Builds all packages
3. Publishes to npm with appropriate tag (alpha/beta/latest)
4. Creates a Git tag (e.g., `v0.1.0-alpha.1`)
5. Creates a GitHub Release

**Version tag detection:**
- `*-alpha.*` → published with `@alpha` tag
- `*-beta.*` → published with `@beta` tag
- `*-rc.*` → published with `@rc` tag
- Otherwise → published with `@latest` tag

### Workflow Details

The release workflow (`.github/workflows/release.yml`) is triggered when:
- Changes are pushed to `release` branch
- Files in `packages/*/src/**` or `packages/*/package.json` are modified

The workflow automatically:
- Checks if the version in `package.json` has changed
- Skips publishing if version tag already exists
- Runs full CI pipeline before publishing
- Determines npm tag based on version string

## Manual Deployment (Alternative)

If you need to publish manually (e.g., from local machine):

### Prerequisites

1. **npm account**: You need an npm account with access to the `@memory-mcp` scope
2. **Authentication**: Login to npm:
   ```bash
   npm login
   ```
3. **Verification**: Verify you're logged in:
   ```bash
   npm whoami
   ```

### Package Structure

Only the `@inchankang/zettel-memory` package is published publicly. Other packages are marked as `private: true` and used as workspace dependencies:

- `@inchankang/zettel-memory` - **PUBLIC** (published to npm)
- `@inchankang/zettel-memory-common` - **PRIVATE** (workspace only)
- `@inchankang/zettel-memory-storage-md` - **PRIVATE** (workspace only)
- `@inchankang/zettel-memory-index-search` - **PRIVATE** (workspace only)
- `@inchankang/zettel-memory-assoc-engine` - **PRIVATE** (workspace only)

### Publishing Steps

#### 1. Test the package locally

```bash
# From project root
cd packages/mcp-server

# Test npm pack (dry-run)
npm pack --dry-run

# Create actual tarball for testing
npm pack

# Test installation from tarball
mkdir /tmp/test-install
cd /tmp/test-install
npm install /home/user/zettel-memory/packages/mcp-server/inchankang-zettel-memory-0.0.1.tgz

# Test the CLI
npx @inchankang/zettel-memory --help
```

#### 2. Publish to npm

```bash
# From packages/mcp-server directory
cd /home/user/zettel-memory/packages/mcp-server

# For stable releases:
npm publish

# For alpha releases, use:
# npm publish --tag alpha

# For beta releases, use:
# npm publish --tag beta
```

**Note**: The `prepublishOnly` script will automatically run `npm run build` before publishing.

#### 3. Verify publication

```bash
# Check on npm registry
npm view @inchankang/zettel-memory

# Test installation from npm
mkdir /tmp/test-npm-install
cd /tmp/test-npm-install
npm install @inchankang/zettel-memory

# Test the CLI
npx @inchankang/zettel-memory --help
```

## Post-deployment

### 1. Create GitHub Release

```bash
# Tag the release
git tag -a v0.0.1 -m "Release v0.0.1: First public release with complete CRUD and FTS5 search"

# Push tag to GitHub
git push origin v0.0.1
```

Then create a release on GitHub:
1. Go to https://github.com/inchan/zettel-memory/releases/new
2. Select the tag `v0.0.1`
3. Title: `v0.0.1 - First Public Release`
4. Copy content from CHANGELOG.md for release notes
5. Publish release

### 2. Update Documentation

- Ensure README.md installation instructions are accurate
- Update any external documentation or blog posts
- Consider writing a release announcement

### 3. Monitor

- Watch for GitHub issues
- Monitor npm download statistics
- Check for installation problems

## Rollback

If critical issues are discovered:

```bash
# Deprecate the version (doesn't remove it)
npm deprecate @inchankang/zettel-memory@0.0.1 "Critical bug - use 0.0.2 instead"

# For complete removal (use sparingly, only within 72 hours)
npm unpublish @inchankang/zettel-memory@0.0.1
```

## Version Bump for Next Release

To prepare for the next release:

```bash
# Update version in all package.json files
# For patch: 0.0.1 -> 0.0.2
# For minor: 0.0.1 -> 0.1.0
# For major: 0.0.1 -> 1.0.0

# Update CHANGELOG.md with new [Unreleased] section
```

## CI/CD (Future)

Once we set up automated deployment:

- GitHub Actions will run tests on every push
- Releases can be automated with GitHub release workflow
- Consider using `semantic-release` for version management

## Security

- Never commit npm tokens to git
- Use npm 2FA for publishing
- Regularly audit dependencies: `npm audit`
- Keep dependencies up to date

## Support

For deployment issues:
- Check GitHub Actions logs (once CI/CD is set up)
- Review npm publish output
- Check npm registry status: https://status.npmjs.org/
