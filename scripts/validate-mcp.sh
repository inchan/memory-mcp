#!/bin/bash

# MCP 서버 통합 검증 스크립트
# 빌드, 린트, 타입 체크, 테스트, MCP 프로토콜 준수 검증

set -e

# 색상 정의
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 옵션 파싱
FAST_MODE=false
CI_MODE=false
SKIP_INSPECTOR=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --fast)
      FAST_MODE=true
      shift
      ;;
    --ci)
      CI_MODE=true
      SKIP_INSPECTOR=true
      shift
      ;;
    --skip-inspector)
      SKIP_INSPECTOR=true
      shift
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--fast] [--ci] [--skip-inspector]"
      exit 1
      ;;
  esac
done

echo -e "${BLUE}🔍 Memory MCP 서버 통합 검증 시작...${NC}"
echo ""

# 검증 단계 카운터
STEP=1
TOTAL_STEPS=8
if [ "$SKIP_INSPECTOR" = true ]; then
  TOTAL_STEPS=7
fi
if [ "$FAST_MODE" = true ]; then
  TOTAL_STEPS=4
fi

# 1. 정리
echo -e "${BLUE}[$STEP/$TOTAL_STEPS] 🧹 프로젝트 정리...${NC}"
npm run clean
echo -e "${GREEN}✅ 정리 완료${NC}"
echo ""
((STEP++))

# 2. 빌드
echo -e "${BLUE}[$STEP/$TOTAL_STEPS] 🔨 프로젝트 빌드...${NC}"
npm run build
echo -e "${GREEN}✅ 빌드 완료${NC}"
echo ""
((STEP++))

# 3. 타입 체크
echo -e "${BLUE}[$STEP/$TOTAL_STEPS] 📋 타입 체크...${NC}"
npm run typecheck
echo -e "${GREEN}✅ 타입 체크 완료${NC}"
echo ""
((STEP++))

# 4. 린트
echo -e "${BLUE}[$STEP/$TOTAL_STEPS] 🔍 린트 검사...${NC}"
npm run lint
echo -e "${GREEN}✅ 린트 검사 완료${NC}"
echo ""
((STEP++))

# Fast 모드는 여기까지
if [ "$FAST_MODE" = true ]; then
  echo ""
  echo -e "${GREEN}✅ 빠른 검증 완료! (Fast Mode)${NC}"
  echo ""
  exit 0
fi

# 5. 유닛 테스트
echo -e "${BLUE}[$STEP/$TOTAL_STEPS] 🧪 유닛 테스트 실행...${NC}"
npm run test:unit
echo -e "${GREEN}✅ 유닛 테스트 통과${NC}"
echo ""
((STEP++))

# 6. 통합 테스트
echo -e "${BLUE}[$STEP/$TOTAL_STEPS] 🔗 통합 테스트 실행...${NC}"
npm run test:integration
echo -e "${GREEN}✅ 통합 테스트 통과${NC}"
echo ""
((STEP++))

# 7. E2E 테스트 (MCP 프로토콜)
echo -e "${BLUE}[$STEP/$TOTAL_STEPS] 🌐 E2E 테스트 실행 (MCP 프로토콜)...${NC}"
npm run test:e2e
echo -e "${GREEN}✅ E2E 테스트 통과${NC}"
echo ""
((STEP++))

# 8. MCP Inspector (CI 모드가 아닐 때만)
if [ "$SKIP_INSPECTOR" = false ]; then
  echo -e "${BLUE}[$STEP/$TOTAL_STEPS] 🔎 MCP Inspector 검증...${NC}"
  echo -e "${YELLOW}   (대화형 모드 - Ctrl+C로 종료)${NC}"
  echo ""

  TEST_VAULT="./test-vault"
  TEST_INDEX="./test-index.db"

  # 기존 테스트 데이터 정리
  rm -rf "$TEST_VAULT" "$TEST_INDEX"
  mkdir -p "$TEST_VAULT"

  # Inspector 실행 (대화형 모드)
  npx @modelcontextprotocol/inspector node packages/mcp-server/dist/cli.js \
    --vault "$TEST_VAULT" \
    --index "$TEST_INDEX" || true

  # 정리
  rm -rf "$TEST_VAULT" "$TEST_INDEX"
  echo ""
  echo -e "${GREEN}✅ Inspector 검증 완료${NC}"
  echo ""
fi

# 최종 요약
echo ""
echo "═══════════════════════════════════════"
echo -e "${GREEN}✅ 모든 검증이 성공적으로 완료되었습니다!${NC}"
echo "═══════════════════════════════════════"
echo ""
echo "검증 항목:"
echo "  ✓ 빌드"
echo "  ✓ 타입 체크"
echo "  ✓ 린트"
if [ "$FAST_MODE" = false ]; then
  echo "  ✓ 유닛 테스트"
  echo "  ✓ 통합 테스트"
  echo "  ✓ E2E 테스트"
  if [ "$SKIP_INSPECTOR" = false ]; then
    echo "  ✓ MCP Inspector"
  fi
fi
echo ""
