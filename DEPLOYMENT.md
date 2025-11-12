# Deployment Guide

This document describes the deployment process for Memory MCP.

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

### Current Release: v0.1.0-alpha.0

This is the first alpha release with MVP functionality (create_note, read_note, list_notes).

## Publishing to npm

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

Only the `@memory-mcp/mcp-server` package is published publicly. Other packages are marked as `private: true` and used as workspace dependencies:

- `@memory-mcp/mcp-server` - **PUBLIC** (published to npm)
- `@memory-mcp/common` - **PRIVATE** (workspace only)
- `@memory-mcp/storage-md` - **PRIVATE** (workspace only)
- `@memory-mcp/index-search` - **PRIVATE** (workspace only)
- `@memory-mcp/assoc-engine` - **PRIVATE** (workspace only)

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
npm install /home/user/memory-mcp/packages/mcp-server/memory-mcp-mcp-server-0.1.0-alpha.0.tgz

# Test the CLI
npx @memory-mcp/mcp-server --help
```

#### 2. Publish to npm

```bash
# From packages/mcp-server directory
cd /home/user/memory-mcp/packages/mcp-server

# Publish with alpha tag
npm publish --tag alpha

# For beta releases, use:
# npm publish --tag beta

# For stable releases, use:
# npm publish
```

**Note**: The `prepublishOnly` script will automatically run `npm run build` before publishing.

#### 3. Verify publication

```bash
# Check on npm registry
npm view @memory-mcp/mcp-server

# Test installation from npm
mkdir /tmp/test-npm-install
cd /tmp/test-npm-install
npm install @memory-mcp/mcp-server@alpha

# Test the CLI
npx @memory-mcp/mcp-server --help
```

## Post-deployment

### 1. Create GitHub Release

```bash
# Tag the release
git tag -a v0.1.0-alpha.0 -m "Release v0.1.0-alpha.0: MVP with create/read/list tools"

# Push tag to GitHub
git push origin v0.1.0-alpha.0
```

Then create a release on GitHub:
1. Go to https://github.com/inchan/memory-mcp/releases/new
2. Select the tag `v0.1.0-alpha.0`
3. Title: `v0.1.0-alpha.0 - MVP Release`
4. Copy content from CHANGELOG.md for release notes
5. Mark as "pre-release" for alpha/beta versions
6. Publish release

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
npm deprecate @memory-mcp/mcp-server@0.1.0-alpha.0 "Critical bug - use 0.1.0-alpha.1 instead"

# For complete removal (use sparingly, only within 72 hours)
npm unpublish @memory-mcp/mcp-server@0.1.0-alpha.0
```

## Version Bump for Next Release

To prepare for the next release:

```bash
# Update version in all package.json files
# For patch: 0.1.0-alpha.0 -> 0.1.0-alpha.1
# For minor: 0.1.0 -> 0.2.0
# For major: 0.1.0 -> 1.0.0

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
