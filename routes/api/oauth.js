// =================================================================================================
// OAuth 소셜로그인 API - Root Endpoint: /api/oauth
// =================================================================================================

var express = require("express");
var router = express.Router();
const maria = require("../../config/maria.js");
const axios = require("axios");
const qs = require("qs");
const {
  OAUTH_GET_TOKEN_URL,
  OAUTH_GET_USERINFO_URL,
  OAUTH_CLIENT_SECRET,
  OAUTH_CLIENT_ID,
} = require("../../constants.js");
const sendOAuthDataWithToken = require("../../utils/send_token");

const saveOAuthGuestData = ({ name, email, img, phone, sex, age, res }) => {
  // ROLE: GUEST일 경우 유저데이터 첫 DB저장 처리

  const query = `INSERT INTO Users(name, email, img, phone, sex, age) VALUES ("${name}","${email}",${
    img ? '"' + img + '"' : null
  }, "${phone}", "${sex}", "${age}");
      SELECT _id as user_id from Users WHERE email = "${email}";`;

  maria.query(query, function (err, result) {
    if (!err) {
      console.log("ROLE: GUEST -> 회원가입 진행");
      console.log(
        "User is registered! UserId: " +
          String(result[1][0]["user_id"]) +
          ", name: " +
          name +
          ", email: " +
          email +
          ", img: " +
          img +
          ", phone: " +
          phone +
          ", sex: " +
          sex +
          ", age: " +
          age
      );
      userId = result[1][0]["user_id"]; // 새롭게 추가된 유저의 아이디 (int)

      // ===== ROLE: GUEST SEND RESPONSE  =====
      // 5. Response로 JWT AccessToken(_id, email), Role 정보 보내기
      sendOAuthDataWithToken({
        userId,
        name,
        role: "GUEST",
        res,
      });
    } else {
      console.log("ERR (소셜로그인) : " + err);
      console.log("Error Query: " + query);
      res.status(409).json({
        error: "body 형식이 틀리거나 데이터베이스에 문제가 발생했습니다.",
      });
    }
  });
};

router.get("/callback", async (req, res) => {
  /*
  #swagger.tags = ['OAuth 소셜 로그인']
  #swagger.summary = 'OAuth 카카오, 네이버 소셜 로그인을 위한 api 입니다.'
*/
  // OAuth Provider = kakao | naver
  let oauthProvider = req.query.provider;
  console.log(`==== OAUTH LOGIN , Provider: ${oauthProvider} ====`);

  // 1. Authorization Code로 naver 서비스 AccessToken 획독
  let token;
  try {
    const url = OAUTH_GET_TOKEN_URL[oauthProvider];
    const body = qs.stringify({
      grant_type: "authorization_code",
      client_id: OAUTH_CLIENT_ID[oauthProvider],
      client_secret: OAUTH_CLIENT_SECRET[oauthProvider],
      redirectUri: `http://www.gongganieum.com/oauth/${oauthProvider}`,
      code: req.query.code, // 프론트로부터 받은 Authorization Code
      state: null, // state는 네이버만
    });
    const header = { "content-type": "application/x-www-form-urlencoded" };
    const response = await axios.post(url, body, header);
    token = response.data.access_token;
  } catch (err) {
    console.log(err);
    console.log("ERR: Error while getting Authorization Code");
    res.status(400).send("ERR: Error while getting Authorization Code");
  }
  console.log("token", token);

  // 2. AccessToken으로 naver 유저 정보 획득
  let oauthUserInfoRes;
  try {
    const url = OAUTH_GET_USERINFO_URL[oauthProvider];
    const Header = {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    };
    const response = await axios.get(url, Header);

    if (oauthProvider === "naver") {
      oauthUserInfoRes = response?.data?.response;
      console.log("== NAVER User Info Response == ", response?.data?.response);
    } else {
      oauthUserInfoRes = response?.data?.properties;
      console.log(
        "== KAKAO == User Info Response ==",
        response?.data?.properties
      );
    }
  } catch (err) {
    console.log(err);
  }
  // const { name, email, profile_image: img } = oauthUserInfoRes; => 네이버
  // const { nickname: name, profile_image: img } = oauthUserInfoRes; => 카카오

  const name =
    oauthProvider === "naver"
      ? oauthUserInfoRes.name
      : oauthUserInfoRes.nickname;
  const email =
    oauthProvider === "naver" ? oauthUserInfoRes.email : name + "@naver.com";
  const img = oauthUserInfoRes.profile_image;
  const phone =
    oauthProvider === "naver" ? oauthUserInfoRes.email : "카카오 지원 X";
  const sex =
    oauthProvider === "naver" ? oauthUserInfoRes.email : "카카오 지원 X";
  const age =
    oauthProvider === "naver" ? oauthUserInfoRes.email : "카카오 지원 X";

  // 3. UserRole 체크, 회원가입 필요 여부 확인
  let userId = "";
  maria.query(
    `SELECT role, _id from Users WHERE email = "${email}";`,
    function (err, result) {
      if (err) {
        console.log("ERR: User Role Check Query ", err);
        return;
      }
      if (!result[0]) {
        // role 존재 X, 회원 정보 없음
        // == ROLE: GUEST ==
        console.log("== ROLE: GUEST ==");
        console.log(`신규 유저! EMAIL ${email}, => 회원가입 진행`);

        // DB에 유저 정보 최초 저장 (게스트 회원가입)
        saveOAuthGuestData({ name, email, img, phone, sex, age, res });
      } else {
        // role 존재 O, 이미 회원이거나 게스트
        // == ROLE: USER OR GUEST ==
        const userRole = result[0]?.role; // int
        userId = result[0]?._id;

        console.log(`== ROLE: ${userRole} ==`);
        console.log(`EMAIL: ${email}, 아이디: ${userId}`);

        // ===== ROLE: USER OR GUEST SEND RESPONSE  =====
        // 5. Response로 JWT AccessToken(_id, email), Role 정보 보내기
        sendOAuthDataWithToken({
          userId,
          name,
          role: userRole,
          res,
        });
        return;
      }
    }
  );
});

module.exports = router;
