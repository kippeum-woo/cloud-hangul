# Cloudflare 무료 배포

GitHub: https://github.com/kippeum-woo/cloud-hangul

## 구성

Workers Static Assets가 화면을 제공하고 Workers가 API와 날씨 요청을 처리합니다.
SQLite Durable Object가 공용 자모, 예약, 글씨, 마커 집계를 저장합니다.
Hibernating WebSockets로 실시간 변경을 전달하며 유휴 실행량을 줄입니다.
외부 데이터베이스와 유료 Volume은 필요 없습니다.

소규모 프로토타입을 위해 하나의 Durable Object 안에서 도시별 SQL 데이터를
분리합니다. 자모 차감과 메시지 게시가 하나의 트랜잭션으로 저장됩니다.
대규모 트래픽에는 도시별 객체 분할과 마커 집계 구조 변경이 필요합니다.
기존 Node `data/` 파일은 자동 이전하지 않습니다.

## 로컬 검증 (Node.js 24)

```sh
npm ci
npm test
npm run test:cloudflare
npm run dev
```

`npm start`는 기존 Node 버전입니다. `dist/`, `.wrangler/`, 로그인 정보는 Git에 올리지 않습니다.

## 첫 배포

Cloudflare Workers Free를 유지합니다. 유료 업그레이드는 필요 없습니다.

```sh
npx wrangler login
npm run deploy
```

`wrangler.jsonc`의 migration이 SQLite Durable Object를 생성합니다.
출력되는 `https://cloud-hangul.<계정>.workers.dev` 주소로 접속합니다.
Durable Object 이름과 migration 기록을 임의로 바꾸지 마세요.

## GitHub 자동 배포 연결

1. GitHub 저장소 `main`에 push합니다.
2. Cloudflare → Workers & Pages → `cloud-hangul` → Settings → Builds.
3. Git 저장소 연결에서 해당 GitHub 저장소의 접근을 승인합니다.
4. Production branch: `main`; Root directory: 저장소 루트.
5. Build command: `npm ci && npm test && npm run test:cloudflare`.
6. Deploy command: `npx wrangler deploy`.
7. 첫 실행 로그에서 테스트와 배포 결과를 확인합니다.

`test:cloudflare`가 정적 파일도 빌드합니다. GitHub Actions는 테스트만 수행합니다.
CLI 첫 배포와 GitHub 자동 배포 연결은 별도 단계입니다. 대시보드에 연결된
저장소가 표시되는지 확인하세요. 운영 토큰은 소스에 넣지 않습니다.

## 무료 한도와 제한

- Workers, Durable Objects 요청·실행량, SQLite 읽기·쓰기·저장 한도가 적용됩니다.
- 한도 내 무료이며 무제한 운영을 의미하지 않습니다. 초과 시 요청이 실패할 수 있습니다.
- 계정에 이미 있는 유료 구독은 자동 변경하지 않습니다.
- 현재 소유권은 익명 브라우저 쿠키 기준이며 기기 간 계정 연동은 없습니다.
- 충전은 요청 시 경과 시간으로 계산하고, 재접속 시 현재 상태를 다시 읽습니다.
- 24시간 지난 메시지는 조회에서 제외되고 오래된 SQL 행은 알람으로 청소합니다.

공식 문서:
- https://developers.cloudflare.com/workers/static-assets/
- https://developers.cloudflare.com/durable-objects/platform/pricing/
- https://developers.cloudflare.com/workers/ci-cd/builds/

원본 번들 커밋: `0c473761c15690a6758f13ff5a0617b10978f622`.
Scribblers 자동 배포는 포함하지 않습니다. 기존 Docker/Railway 설정은 선택적인
Node 호스팅용이며 Cloudflare에서 사용하지 않습니다.
