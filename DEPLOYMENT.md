# 구름한글 독립 배포

이 폴더만 새 GitHub 저장소에 올립니다. 원본 번들의 Scribblers 배포 워크플로는 포함하지 않았습니다.
원본 커밋: 0c473761c15690a6758f13ff5a0617b10978f622.
공유 mount 유틸리티를 server/mount.js에 복사하고 두 import를 수정했습니다.

## 로컬 실행

Node.js 24에서:

```sh
npm ci
npm test
npm start
```

http://localhost:3000 에서 실행됩니다. /health는 서버 상태입니다.

## GitHub → Railway

1. GitHub에 빈 저장소를 만들고 이 폴더의 Git 저장소를 push합니다.
2. Railway에서 새로운 프로젝트/서비스를 만들고 해당 GitHub 저장소를 연결합니다. 기존 Scribblers 서비스에 연결하지 않습니다.
3. Root Directory는 저장소 루트로 둡니다. Dockerfile과 railway.toml이 이 위치에 있습니다.
4. 서비스에 영구 Volume을 추가하고 mount path를 `/data`로 설정합니다.
5. `DATA_DIR=/data`, `HOST=0.0.0.0`을 확인합니다. Dockerfile에 기본값이 있으며 PORT는 플랫폼이 제공하는 값을 사용합니다.
6. 단일 인스턴스만 실행합니다. 현재 JSON 파일과 메모리 기반 동기화는 여러 복제 서버를 지원하지 않습니다.
7. 배포 성공 후 Networking에서 Generate Domain으로 HTTPS 주소를 만듭니다.
8. 두 브라우저에서 같은 도시의 메시지/자모 공유를 확인하고 재배포 뒤에도 메시지가 남는지 확인합니다.

Docker 이미지 빌드 중에도 테스트가 실행되므로 실패하면 새 이미지가 만들어지지 않습니다.
GitHub 테스트 워크플로 자체에는 배포 권한이나 운영 토큰이 없습니다.
Railway의 GitHub 자동 배포는 별도 설정이므로 선택한 branch와 자동 배포 설정을 확인하세요.

## 제한과 운영

- 영구 Volume을 만들지 않으면 재배포 시 메시지와 자모 재고가 사라질 수 있습니다.
- 현재 로그인은 없으며 소유권은 브라우저 쿠키 기준입니다. 기기 간 동일 계정 기능은 아직 없습니다.
- 실제 날씨 요청 실패 시 시뮬레이션으로 대체됩니다.
- 대규모 공개 운영 전에 데이터베이스, 요청 제한, 신고/관리 기능을 검토해야 합니다.
- 원본 번들에는 Git 이력이 들어 있지만 이 배포 저장소는 구름한글 코드만 담은 새 이력으로 시작합니다.
- 호스팅 요금은 계정의 선택 플랜과 사용량에 따라 달라집니다.

공식 문서:
- https://docs.railway.com/builds/dockerfiles
- https://docs.railway.com/guides/docker-compose
- https://docs.railway.com/services
