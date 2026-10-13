# 달무티 고정 주소로 배포하기 (Render + MongoDB Atlas, 무료)

컴퓨터를 켜 두지 않아도 `https://dalmuti-xxxx.onrender.com` 같은 **고정 주소**로 수업할 수 있어요.
약 15분 걸려요. 순서대로 따라 하세요.

> 선생님 화면은 `주소/teacher`, 학생 입장은 선생님 화면의 QR로 해요.

---

## 1단계. GitHub에 올리기 (코드 보관)

1. https://github.com/new 에서 새 저장소를 만들어요.
   - 이름: `dalmuti` (원하는 이름 아무거나)
   - **Private(비공개)** 선택, "Add a README" 등은 모두 **체크하지 않기** (빈 저장소여야 해요)
2. PowerShell(또는 터미널)에서 아래를 한 줄씩 실행해요. `내아이디`만 바꾸세요.

```powershell
cd C:\Users\ochy\Downloads\dalmuti\dalmuti-main
git remote add origin https://github.com/내아이디/dalmuti.git
git push -u origin main
```

처음 push할 때 브라우저가 열려 GitHub 로그인을 물어보면 로그인하세요.

---

## 2단계. MongoDB Atlas (데이터베이스, 무료)

1. https://www.mongodb.com/cloud/atlas/register 에서 가입해요. (구글 계정으로 가능)
2. **Create** → **M0 (Free)** 클러스터를 만들어요. 지역은 가까운 곳(예: Seoul 또는 Tokyo).
3. 만들 때 나오는 **Database User** 를 하나 만들어요.
   - 아이디/비밀번호를 적어 두세요. (비밀번호에 `@ : / ?` 같은 특수문자가 있으면 접속 주소가 깨질 수 있으니 **영문+숫자만** 쓰세요)
4. 왼쪽 메뉴 **Network Access** → **Add IP Address** → **Allow Access from Anywhere (0.0.0.0/0)** → Confirm.
   (Render의 IP가 계속 바뀌어서 이렇게 열어야 해요. 비밀번호가 있으니 괜찮아요.)
5. **Database** → 클러스터의 **Connect** → **Drivers** → 나오는 접속 주소를 복사해요.
   ```
   mongodb+srv://아이디:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
   `<password>` 부분을 **실제 비밀번호로 바꿔서** 메모해 두세요. (이게 `MONGODB_URI` 예요)

---

## 3단계. Render (서버, 무료)

1. https://render.com 에서 **GitHub 계정으로 가입**해요.
2. **New +** → **Blueprint** 를 눌러요. (저장소의 `render.yaml` 을 읽어서 설정해줘요)
3. GitHub 저장소 접근을 허용하고 `dalmuti` 를 선택해요.
4. 환경 변수 입력 칸이 나오면 `MONGODB_URI` 에 **2단계에서 메모한 접속 주소**를 붙여넣어요.
5. **Apply / Deploy** 를 눌러요. 처음 빌드는 5~10분 걸려요.
6. 끝나면 서비스 화면 위쪽에 `https://dalmuti-xxxx.onrender.com` 주소가 보여요. 이게 고정 주소예요!

> **Blueprint 메뉴가 없으면**: New + → **Web Service** → 저장소 선택 → Runtime: **Docker** →
> Instance Type: **Free** → Environment에 `MONGODB_URI` 추가 → Create.

---

## 4단계. 확인

- `https://내주소.onrender.com/api` → `{"message":"dalmuti"}` 가 보이면 서버 정상
- `https://내주소.onrender.com/teacher` → 선생님 화면 → "수업 방 만들기" → QR로 폰에서 입장

---

## 수업 때 알아둘 점

- **무료 서버는 15분쯤 아무도 안 쓰면 잠들어요.** 다시 열면 처음 30~60초 걸려요.
  → 수업 시작 5분 전에 선생님이 `주소/teacher` 를 한 번 열어 두세요. (그러면 학생들은 바로 들어와요)
- 잠들지 않게 하려면:
  - 무료: https://uptimerobot.com 에서 `주소/api` 를 5분마다 확인(ping)하도록 등록 (무료)
  - 또는 Render를 유료(Starter, 월 $7)로 올리기
- **수업 중에는 코드를 다시 배포하지 마세요.** (서버가 재시작되면 학생 연결이 잠깐 끊겨요. 10분 안에 자기 자리로 돌아오게 해두긴 했어요)
- 코드를 고치고 GitHub에 push 하면 Render가 자동으로 다시 배포해요.

## 문제가 생기면

| 증상 | 확인할 것 |
|---|---|
| 배포가 실패해요 | Render의 **Logs** 에서 빨간 줄을 확인해요 |
| 서버는 뜨는데 방이 안 만들어져요 | `MONGODB_URI` 의 비밀번호/아이디, Atlas **Network Access** 0.0.0.0/0 확인 |
| 처음 열 때 한참 걸려요 | 무료 서버가 잠들었다 깨는 중이에요 (30~60초) |
| 주소를 학생들에게 알려줘야 해요 | 선생님 화면의 QR을 보여주세요 (주소가 자동으로 들어 있어요) |

## 로컬(내 컴퓨터)에서 쓰던 방식은 그대로예요

`start.bat` 로 켜는 기존 방식도 계속 쓸 수 있어요. (인터넷 연결 없이 같은 와이파이에서 쓸 때 등)
