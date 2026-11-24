휠체어RPG 온라인 마을 서버
=========================
기능: 같은 서버에 접속한 사람들이 마을에서 서로의 모습(위치·닉네임·레벨·칭호)을 봅니다. 공격/거래 등 상호작용은 없습니다.
게임 저장/진행은 지금처럼 각자 기기에 저장되며 서버는 위치만 중계합니다(서버에는 아무것도 저장되지 않음).

[내 컴퓨터에서 테스트]
1) Node.js 18 이상 설치
2) 이 폴더에서:  node server.js      -> http://localhost:8080 에서 "서버 정상 작동 중" 확인
3) 게임 주소 뒤에 ?server=ws://localhost:8080 를 붙여 두 개의 창으로 열면 서로 보입니다.
   (예: index.html?server=ws://localhost:8080 )

[인터넷에 올리기 - Render 무료 (예시)]
1) GitHub 계정에 새 저장소를 만들고 이 폴더(server.js, package.json)를 올립니다.
2) https://render.com 가입 -> New + -> Web Service -> 그 저장소 선택
3) Runtime: Node / Build Command: (비움 또는 npm install) / Start Command: node server.js / Instance Type: Free
4) 배포가 끝나면 https://이름.onrender.com 주소가 생깁니다. 이 주소의 https 를 wss 로 바꾼 것이 서버 주소입니다.
   -> wss://이름.onrender.com
   (무료 플랜은 한동안 접속이 없으면 잠들어서 첫 접속이 30초~1분 느릴 수 있습니다.)

[게임에 서버 주소 연결]
- 방법 A: 게임 주소 뒤에 ?server=wss://이름.onrender.com 를 붙여 한 번 접속 -> 그 브라우저는 주소를 기억합니다.
- 방법 B(모두에게 적용): index.html 안의  const DEFAULT_SERVER='';  를  const DEFAULT_SERVER='wss://이름.onrender.com';  로 고쳐서 다시 올립니다.
  (게임이 https 사이트이면 서버는 반드시 wss:// 여야 합니다.)


[가장 쉬운 방법: 게임과 서버를 한 번에 올리기]
- 이 폴더에는 최신 게임(index.html)이 함께 들어 있습니다. 이 폴더 전체(server.js, package.json, index.html)를 GitHub에 올리고 Render로 배포하면,
  https://이름.onrender.com 주소로 접속하는 것만으로 게임이 열리고 온라인 마을도 자동으로 연결됩니다. (서버 주소 설정 불필요)
  다른 사람들에게는 그 https://이름.onrender.com 주소를 알려 주세요.
