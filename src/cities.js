// The playable city skies. Every message belongs to one city by its stable
// id, so ids must never change once published. To add a city, append a row:
// the id is derived from country, US state and English name, and validated by
// test/cities.test.js (unique id, valid IANA timezone, sane coordinates).
//
// Countries: [code, Korean name, English name]
// Rows:      [country, Korean name, English name, lat, lon, IANA timezone, kind]
// kind is "capital" or "major". US rows carry a state code instead of kind,
// and the United States has exactly one representative city per state.

export const COUNTRIES = [
  ["AD", "안도라", "Andorra"], ["AE", "아랍에미리트", "United Arab Emirates"], ["AF", "아프가니스탄", "Afghanistan"],
  ["AG", "앤티가 바부다", "Antigua and Barbuda"], ["AL", "알바니아", "Albania"], ["AM", "아르메니아", "Armenia"],
  ["AO", "앙골라", "Angola"], ["AR", "아르헨티나", "Argentina"], ["AT", "오스트리아", "Austria"],
  ["AU", "오스트레일리아", "Australia"], ["AZ", "아제르바이잔", "Azerbaijan"], ["BA", "보스니아 헤르체고비나", "Bosnia and Herzegovina"],
  ["BB", "바베이도스", "Barbados"], ["BD", "방글라데시", "Bangladesh"], ["BE", "벨기에", "Belgium"],
  ["BF", "부르키나파소", "Burkina Faso"], ["BG", "불가리아", "Bulgaria"], ["BH", "바레인", "Bahrain"],
  ["BI", "부룬디", "Burundi"], ["BJ", "베냉", "Benin"], ["BN", "브루나이", "Brunei"],
  ["BO", "볼리비아", "Bolivia"], ["BR", "브라질", "Brazil"], ["BS", "바하마", "Bahamas"],
  ["BT", "부탄", "Bhutan"], ["BW", "보츠와나", "Botswana"], ["BY", "벨라루스", "Belarus"],
  ["BZ", "벨리즈", "Belize"], ["CA", "캐나다", "Canada"], ["CD", "콩고민주공화국", "DR Congo"],
  ["CF", "중앙아프리카공화국", "Central African Republic"], ["CG", "콩고", "Republic of the Congo"], ["CH", "스위스", "Switzerland"],
  ["CI", "코트디부아르", "Côte d'Ivoire"], ["CL", "칠레", "Chile"], ["CM", "카메룬", "Cameroon"],
  ["CN", "중국", "China"], ["CO", "콜롬비아", "Colombia"], ["CR", "코스타리카", "Costa Rica"],
  ["CU", "쿠바", "Cuba"], ["CV", "카보베르데", "Cabo Verde"], ["CY", "키프로스", "Cyprus"],
  ["CZ", "체코", "Czechia"], ["DE", "독일", "Germany"], ["DJ", "지부티", "Djibouti"],
  ["DK", "덴마크", "Denmark"], ["DM", "도미니카 연방", "Dominica"], ["DO", "도미니카 공화국", "Dominican Republic"],
  ["DZ", "알제리", "Algeria"], ["EC", "에콰도르", "Ecuador"], ["EE", "에스토니아", "Estonia"],
  ["EG", "이집트", "Egypt"], ["ER", "에리트레아", "Eritrea"], ["ES", "스페인", "Spain"],
  ["ET", "에티오피아", "Ethiopia"], ["FI", "핀란드", "Finland"], ["FJ", "피지", "Fiji"],
  ["FM", "미크로네시아", "Micronesia"], ["FR", "프랑스", "France"], ["GA", "가봉", "Gabon"],
  ["GB", "영국", "United Kingdom"], ["GD", "그레나다", "Grenada"], ["GE", "조지아", "Georgia"],
  ["GH", "가나", "Ghana"], ["GM", "감비아", "Gambia"], ["GN", "기니", "Guinea"],
  ["GQ", "적도 기니", "Equatorial Guinea"], ["GR", "그리스", "Greece"], ["GT", "과테말라", "Guatemala"],
  ["GW", "기니비사우", "Guinea-Bissau"], ["GY", "가이아나", "Guyana"], ["HN", "온두라스", "Honduras"],
  ["HR", "크로아티아", "Croatia"], ["HT", "아이티", "Haiti"], ["HU", "헝가리", "Hungary"],
  ["ID", "인도네시아", "Indonesia"], ["IE", "아일랜드", "Ireland"], ["IL", "이스라엘", "Israel"],
  ["IN", "인도", "India"], ["IQ", "이라크", "Iraq"], ["IR", "이란", "Iran"],
  ["IS", "아이슬란드", "Iceland"], ["IT", "이탈리아", "Italy"], ["JM", "자메이카", "Jamaica"],
  ["JO", "요르단", "Jordan"], ["JP", "일본", "Japan"], ["KE", "케냐", "Kenya"],
  ["KG", "키르기스스탄", "Kyrgyzstan"], ["KH", "캄보디아", "Cambodia"], ["KI", "키리바시", "Kiribati"],
  ["KM", "코모로", "Comoros"], ["KN", "세인트키츠 네비스", "Saint Kitts and Nevis"], ["KP", "북한", "North Korea"],
  ["KR", "대한민국", "South Korea"], ["KW", "쿠웨이트", "Kuwait"], ["KZ", "카자흐스탄", "Kazakhstan"],
  ["LA", "라오스", "Laos"], ["LB", "레바논", "Lebanon"], ["LC", "세인트루시아", "Saint Lucia"],
  ["LI", "리히텐슈타인", "Liechtenstein"], ["LK", "스리랑카", "Sri Lanka"], ["LR", "라이베리아", "Liberia"],
  ["LS", "레소토", "Lesotho"], ["LT", "리투아니아", "Lithuania"], ["LU", "룩셈부르크", "Luxembourg"],
  ["LV", "라트비아", "Latvia"], ["LY", "리비아", "Libya"], ["MA", "모로코", "Morocco"],
  ["MC", "모나코", "Monaco"], ["MD", "몰도바", "Moldova"], ["ME", "몬테네그로", "Montenegro"],
  ["MG", "마다가스카르", "Madagascar"], ["MH", "마셜 제도", "Marshall Islands"], ["MK", "북마케도니아", "North Macedonia"],
  ["ML", "말리", "Mali"], ["MM", "미얀마", "Myanmar"], ["MN", "몽골", "Mongolia"],
  ["MR", "모리타니", "Mauritania"], ["MT", "몰타", "Malta"], ["MU", "모리셔스", "Mauritius"],
  ["MV", "몰디브", "Maldives"], ["MW", "말라위", "Malawi"], ["MX", "멕시코", "Mexico"],
  ["MY", "말레이시아", "Malaysia"], ["MZ", "모잠비크", "Mozambique"], ["NA", "나미비아", "Namibia"],
  ["NE", "니제르", "Niger"], ["NG", "나이지리아", "Nigeria"], ["NI", "니카라과", "Nicaragua"],
  ["NL", "네덜란드", "Netherlands"], ["NO", "노르웨이", "Norway"], ["NP", "네팔", "Nepal"],
  ["NR", "나우루", "Nauru"], ["NZ", "뉴질랜드", "New Zealand"], ["OM", "오만", "Oman"],
  ["PA", "파나마", "Panama"], ["PE", "페루", "Peru"], ["PG", "파푸아뉴기니", "Papua New Guinea"],
  ["PH", "필리핀", "Philippines"], ["PK", "파키스탄", "Pakistan"], ["PL", "폴란드", "Poland"],
  ["PS", "팔레스타인", "Palestine"], ["PT", "포르투갈", "Portugal"], ["PW", "팔라우", "Palau"],
  ["PY", "파라과이", "Paraguay"], ["QA", "카타르", "Qatar"], ["RO", "루마니아", "Romania"],
  ["RS", "세르비아", "Serbia"], ["RU", "러시아", "Russia"], ["RW", "르완다", "Rwanda"],
  ["SA", "사우디아라비아", "Saudi Arabia"], ["SB", "솔로몬 제도", "Solomon Islands"], ["SC", "세이셸", "Seychelles"],
  ["SD", "수단", "Sudan"], ["SE", "스웨덴", "Sweden"], ["SG", "싱가포르", "Singapore"],
  ["SI", "슬로베니아", "Slovenia"], ["SK", "슬로바키아", "Slovakia"], ["SL", "시에라리온", "Sierra Leone"],
  ["SM", "산마리노", "San Marino"], ["SN", "세네갈", "Senegal"], ["SO", "소말리아", "Somalia"],
  ["SR", "수리남", "Suriname"], ["SS", "남수단", "South Sudan"], ["ST", "상투메 프린시페", "São Tomé and Príncipe"],
  ["SV", "엘살바도르", "El Salvador"], ["SY", "시리아", "Syria"], ["SZ", "에스와티니", "Eswatini"],
  ["TD", "차드", "Chad"], ["TG", "토고", "Togo"], ["TH", "태국", "Thailand"],
  ["TJ", "타지키스탄", "Tajikistan"], ["TL", "동티모르", "Timor-Leste"], ["TM", "투르크메니스탄", "Turkmenistan"],
  ["TN", "튀니지", "Tunisia"], ["TO", "통가", "Tonga"], ["TR", "튀르키예", "Türkiye"],
  ["TT", "트리니다드 토바고", "Trinidad and Tobago"], ["TV", "투발루", "Tuvalu"], ["TW", "대만", "Taiwan"],
  ["TZ", "탄자니아", "Tanzania"], ["UA", "우크라이나", "Ukraine"], ["UG", "우간다", "Uganda"],
  ["US", "미국", "United States"], ["UY", "우루과이", "Uruguay"], ["UZ", "우즈베키스탄", "Uzbekistan"],
  ["VA", "바티칸", "Vatican City"], ["VC", "세인트빈센트 그레나딘", "Saint Vincent and the Grenadines"], ["VE", "베네수엘라", "Venezuela"],
  ["VN", "베트남", "Vietnam"], ["VU", "바누아투", "Vanuatu"], ["WS", "사모아", "Samoa"],
  ["XK", "코소보", "Kosovo"], ["YE", "예멘", "Yemen"], ["ZA", "남아프리카 공화국", "South Africa"],
  ["ZM", "잠비아", "Zambia"], ["ZW", "짐바브웨", "Zimbabwe"],
];

// [code, Korean name, English name]
export const US_STATES = [
  ["AL", "앨라배마", "Alabama"], ["AK", "알래스카", "Alaska"], ["AZ", "애리조나", "Arizona"], ["AR", "아칸소", "Arkansas"],
  ["CA", "캘리포니아", "California"], ["CO", "콜로라도", "Colorado"], ["CT", "코네티컷", "Connecticut"], ["DE", "델라웨어", "Delaware"],
  ["FL", "플로리다", "Florida"], ["GA", "조지아", "Georgia"], ["HI", "하와이", "Hawaii"], ["ID", "아이다호", "Idaho"],
  ["IL", "일리노이", "Illinois"], ["IN", "인디애나", "Indiana"], ["IA", "아이오와", "Iowa"], ["KS", "캔자스", "Kansas"],
  ["KY", "켄터키", "Kentucky"], ["LA", "루이지애나", "Louisiana"], ["ME", "메인", "Maine"], ["MD", "메릴랜드", "Maryland"],
  ["MA", "매사추세츠", "Massachusetts"], ["MI", "미시간", "Michigan"], ["MN", "미네소타", "Minnesota"], ["MS", "미시시피", "Mississippi"],
  ["MO", "미주리", "Missouri"], ["MT", "몬태나", "Montana"], ["NE", "네브래스카", "Nebraska"], ["NV", "네바다", "Nevada"],
  ["NH", "뉴햄프셔", "New Hampshire"], ["NJ", "뉴저지", "New Jersey"], ["NM", "뉴멕시코", "New Mexico"], ["NY", "뉴욕", "New York"],
  ["NC", "노스캐롤라이나", "North Carolina"], ["ND", "노스다코타", "North Dakota"], ["OH", "오하이오", "Ohio"], ["OK", "오클라호마", "Oklahoma"],
  ["OR", "오리건", "Oregon"], ["PA", "펜실베이니아", "Pennsylvania"], ["RI", "로드아일랜드", "Rhode Island"], ["SC", "사우스캐롤라이나", "South Carolina"],
  ["SD", "사우스다코타", "South Dakota"], ["TN", "테네시", "Tennessee"], ["TX", "텍사스", "Texas"], ["UT", "유타", "Utah"],
  ["VT", "버몬트", "Vermont"], ["VA", "버지니아", "Virginia"], ["WA", "워싱턴", "Washington"], ["WV", "웨스트버지니아", "West Virginia"],
  ["WI", "위스콘신", "Wisconsin"], ["WY", "와이오밍", "Wyoming"],
];

// [state, Korean name, English name, lat, lon, timezone]
const US_ROWS = [
  ["AL", "버밍햄", "Birmingham", 33.52, -86.8, "America/Chicago"],
  ["AK", "앵커리지", "Anchorage", 61.22, -149.9, "America/Anchorage"],
  ["AZ", "피닉스", "Phoenix", 33.45, -112.07, "America/Phoenix"],
  ["AR", "리틀록", "Little Rock", 34.75, -92.29, "America/Chicago"],
  ["CA", "로스앤젤레스", "Los Angeles", 34.05, -118.24, "America/Los_Angeles"],
  ["CO", "덴버", "Denver", 39.74, -104.99, "America/Denver"],
  ["CT", "하트퍼드", "Hartford", 41.76, -72.68, "America/New_York"],
  ["DE", "윌밍턴", "Wilmington", 39.74, -75.55, "America/New_York"],
  ["FL", "마이애미", "Miami", 25.76, -80.19, "America/New_York"],
  ["GA", "애틀랜타", "Atlanta", 33.75, -84.39, "America/New_York"],
  ["HI", "호놀룰루", "Honolulu", 21.31, -157.86, "Pacific/Honolulu"],
  ["ID", "보이시", "Boise", 43.62, -116.2, "America/Boise"],
  ["IL", "시카고", "Chicago", 41.88, -87.63, "America/Chicago"],
  ["IN", "인디애나폴리스", "Indianapolis", 39.77, -86.16, "America/Indiana/Indianapolis"],
  ["IA", "디모인", "Des Moines", 41.59, -93.62, "America/Chicago"],
  ["KS", "위치토", "Wichita", 37.69, -97.34, "America/Chicago"],
  ["KY", "루이빌", "Louisville", 38.25, -85.76, "America/Kentucky/Louisville"],
  ["LA", "뉴올리언스", "New Orleans", 29.95, -90.07, "America/Chicago"],
  ["ME", "포틀랜드", "Portland", 43.66, -70.26, "America/New_York"],
  ["MD", "볼티모어", "Baltimore", 39.29, -76.61, "America/New_York"],
  ["MA", "보스턴", "Boston", 42.36, -71.06, "America/New_York"],
  ["MI", "디트로이트", "Detroit", 42.33, -83.05, "America/Detroit"],
  ["MN", "미니애폴리스", "Minneapolis", 44.98, -93.27, "America/Chicago"],
  ["MS", "잭슨", "Jackson", 32.3, -90.18, "America/Chicago"],
  ["MO", "캔자스시티", "Kansas City", 39.1, -94.58, "America/Chicago"],
  ["MT", "빌링스", "Billings", 45.78, -108.5, "America/Denver"],
  ["NE", "오마하", "Omaha", 41.26, -95.94, "America/Chicago"],
  ["NV", "라스베이거스", "Las Vegas", 36.17, -115.14, "America/Los_Angeles"],
  ["NH", "맨체스터", "Manchester", 42.99, -71.46, "America/New_York"],
  ["NJ", "뉴어크", "Newark", 40.74, -74.17, "America/New_York"],
  ["NM", "앨버커키", "Albuquerque", 35.08, -106.65, "America/Denver"],
  ["NY", "뉴욕", "New York", 40.71, -74.01, "America/New_York"],
  ["NC", "샬럿", "Charlotte", 35.23, -80.84, "America/New_York"],
  ["ND", "파고", "Fargo", 46.88, -96.79, "America/Chicago"],
  ["OH", "콜럼버스", "Columbus", 39.96, -83.0, "America/New_York"],
  ["OK", "오클라호마시티", "Oklahoma City", 35.47, -97.52, "America/Chicago"],
  ["OR", "포틀랜드", "Portland", 45.52, -122.68, "America/Los_Angeles"],
  ["PA", "필라델피아", "Philadelphia", 39.95, -75.17, "America/New_York"],
  ["RI", "프로비던스", "Providence", 41.82, -71.41, "America/New_York"],
  ["SC", "찰스턴", "Charleston", 32.78, -79.93, "America/New_York"],
  ["SD", "수폴스", "Sioux Falls", 43.54, -96.73, "America/Chicago"],
  ["TN", "내슈빌", "Nashville", 36.16, -86.78, "America/Chicago"],
  ["TX", "휴스턴", "Houston", 29.76, -95.37, "America/Chicago"],
  ["UT", "솔트레이크시티", "Salt Lake City", 40.76, -111.89, "America/Denver"],
  ["VT", "벌링턴", "Burlington", 44.48, -73.21, "America/New_York"],
  ["VA", "버지니아비치", "Virginia Beach", 36.85, -75.98, "America/New_York"],
  ["WA", "시애틀", "Seattle", 47.61, -122.33, "America/Los_Angeles"],
  ["WV", "찰스턴", "Charleston", 38.35, -81.63, "America/New_York"],
  ["WI", "밀워키", "Milwaukee", 43.04, -87.91, "America/Chicago"],
  ["WY", "샤이엔", "Cheyenne", 41.14, -104.82, "America/Denver"],
];

const C = "capital";
const M = "major";
const WORLD_ROWS = [
  // Africa
  ["DZ", "알제", "Algiers", 36.75, 3.06, "Africa/Algiers", C],
  ["AO", "루안다", "Luanda", -8.84, 13.23, "Africa/Luanda", C],
  ["BJ", "포르토노보", "Porto-Novo", 6.5, 2.6, "Africa/Porto-Novo", C],
  ["BW", "가보로네", "Gaborone", -24.63, 25.92, "Africa/Gaborone", C],
  ["BF", "와가두구", "Ouagadougou", 12.37, -1.53, "Africa/Ouagadougou", C],
  ["BI", "기테가", "Gitega", -3.43, 29.93, "Africa/Bujumbura", C],
  ["CV", "프라이아", "Praia", 14.93, -23.51, "Atlantic/Cape_Verde", C],
  ["CM", "야운데", "Yaoundé", 3.85, 11.5, "Africa/Douala", C],
  ["CF", "방기", "Bangui", 4.39, 18.56, "Africa/Bangui", C],
  ["TD", "은자메나", "N'Djamena", 12.13, 15.06, "Africa/Ndjamena", C],
  ["KM", "모로니", "Moroni", -11.7, 43.26, "Indian/Comoro", C],
  ["CG", "브라자빌", "Brazzaville", -4.27, 15.28, "Africa/Brazzaville", C],
  ["CD", "킨샤사", "Kinshasa", -4.44, 15.27, "Africa/Kinshasa", C],
  ["CI", "야무수크로", "Yamoussoukro", 6.83, -5.29, "Africa/Abidjan", C],
  ["DJ", "지부티", "Djibouti", 11.59, 43.15, "Africa/Djibouti", C],
  ["EG", "카이로", "Cairo", 30.04, 31.24, "Africa/Cairo", C],
  ["GQ", "말라보", "Malabo", 3.75, 8.78, "Africa/Malabo", C],
  ["ER", "아스마라", "Asmara", 15.32, 38.93, "Africa/Asmara", C],
  ["SZ", "음바바네", "Mbabane", -26.31, 31.14, "Africa/Mbabane", C],
  ["ET", "아디스아바바", "Addis Ababa", 9.03, 38.74, "Africa/Addis_Ababa", C],
  ["GA", "리브르빌", "Libreville", 0.42, 9.47, "Africa/Libreville", C],
  ["GM", "반줄", "Banjul", 13.45, -16.58, "Africa/Banjul", C],
  ["GH", "아크라", "Accra", 5.6, -0.19, "Africa/Accra", C],
  ["GN", "코나크리", "Conakry", 9.64, -13.58, "Africa/Conakry", C],
  ["GW", "비사우", "Bissau", 11.86, -15.6, "Africa/Bissau", C],
  ["KE", "나이로비", "Nairobi", -1.29, 36.82, "Africa/Nairobi", C],
  ["LS", "마세루", "Maseru", -29.31, 27.48, "Africa/Maseru", C],
  ["LR", "몬로비아", "Monrovia", 6.3, -10.8, "Africa/Monrovia", C],
  ["LY", "트리폴리", "Tripoli", 32.89, 13.19, "Africa/Tripoli", C],
  ["MG", "안타나나리보", "Antananarivo", -18.88, 47.51, "Indian/Antananarivo", C],
  ["MW", "릴롱궤", "Lilongwe", -13.96, 33.79, "Africa/Blantyre", C],
  ["ML", "바마코", "Bamako", 12.64, -8.0, "Africa/Bamako", C],
  ["MR", "누악쇼트", "Nouakchott", 18.08, -15.98, "Africa/Nouakchott", C],
  ["MU", "포트루이스", "Port Louis", -20.16, 57.5, "Indian/Mauritius", C],
  ["MA", "라바트", "Rabat", 34.02, -6.84, "Africa/Casablanca", C],
  ["MA", "카사블랑카", "Casablanca", 33.57, -7.59, "Africa/Casablanca", M],
  ["MA", "마라케시", "Marrakesh", 31.63, -7.99, "Africa/Casablanca", M],
  ["MZ", "마푸투", "Maputo", -25.97, 32.57, "Africa/Maputo", C],
  ["NA", "빈트후크", "Windhoek", -22.56, 17.08, "Africa/Windhoek", C],
  ["NE", "니아메", "Niamey", 13.51, 2.11, "Africa/Niamey", C],
  ["NG", "아부자", "Abuja", 9.08, 7.4, "Africa/Lagos", C],
  ["NG", "라고스", "Lagos", 6.52, 3.38, "Africa/Lagos", M],
  ["RW", "키갈리", "Kigali", -1.95, 30.06, "Africa/Kigali", C],
  ["ST", "상투메", "São Tomé", 0.34, 6.73, "Africa/Sao_Tome", C],
  ["SN", "다카르", "Dakar", 14.72, -17.47, "Africa/Dakar", C],
  ["SC", "빅토리아", "Victoria", -4.62, 55.45, "Indian/Mahe", C],
  ["SL", "프리타운", "Freetown", 8.48, -13.23, "Africa/Freetown", C],
  ["SO", "모가디슈", "Mogadishu", 2.05, 45.32, "Africa/Mogadishu", C],
  ["ZA", "프리토리아", "Pretoria", -25.75, 28.19, "Africa/Johannesburg", C],
  ["ZA", "케이프타운", "Cape Town", -33.92, 18.42, "Africa/Johannesburg", M],
  ["ZA", "요하네스버그", "Johannesburg", -26.2, 28.05, "Africa/Johannesburg", M],
  ["SS", "주바", "Juba", 4.85, 31.58, "Africa/Juba", C],
  ["SD", "하르툼", "Khartoum", 15.5, 32.56, "Africa/Khartoum", C],
  ["TZ", "도도마", "Dodoma", -6.16, 35.75, "Africa/Dar_es_Salaam", C],
  ["TG", "로메", "Lomé", 6.13, 1.22, "Africa/Lome", C],
  ["TN", "튀니스", "Tunis", 36.81, 10.18, "Africa/Tunis", C],
  ["UG", "캄팔라", "Kampala", 0.35, 32.58, "Africa/Kampala", C],
  ["ZM", "루사카", "Lusaka", -15.39, 28.32, "Africa/Lusaka", C],
  ["ZW", "하라레", "Harare", -17.83, 31.05, "Africa/Harare", C],
  // Americas
  ["AG", "세인트존스", "St. John's", 17.12, -61.85, "America/Antigua", C],
  ["AR", "부에노스아이레스", "Buenos Aires", -34.6, -58.38, "America/Argentina/Buenos_Aires", C],
  ["AR", "우수아이아", "Ushuaia", -54.8, -68.3, "America/Argentina/Ushuaia", M],
  ["BS", "나소", "Nassau", 25.05, -77.35, "America/Nassau", C],
  ["BB", "브리지타운", "Bridgetown", 13.1, -59.62, "America/Barbados", C],
  ["BZ", "벨모판", "Belmopan", 17.25, -88.76, "America/Belize", C],
  ["BO", "수크레", "Sucre", -19.05, -65.26, "America/La_Paz", C],
  ["BO", "라파스", "La Paz", -16.49, -68.12, "America/La_Paz", M],
  ["BR", "브라질리아", "Brasília", -15.79, -47.88, "America/Sao_Paulo", C],
  ["BR", "상파울루", "São Paulo", -23.55, -46.63, "America/Sao_Paulo", M],
  ["BR", "리우데자네이루", "Rio de Janeiro", -22.91, -43.17, "America/Sao_Paulo", M],
  ["CA", "오타와", "Ottawa", 45.42, -75.7, "America/Toronto", C],
  ["CA", "토론토", "Toronto", 43.65, -79.38, "America/Toronto", M],
  ["CA", "밴쿠버", "Vancouver", 49.28, -123.12, "America/Vancouver", M],
  ["CA", "몬트리올", "Montreal", 45.5, -73.57, "America/Toronto", M],
  ["CL", "산티아고", "Santiago", -33.45, -70.67, "America/Santiago", C],
  ["CL", "푼타아레나스", "Punta Arenas", -53.16, -70.91, "America/Punta_Arenas", M],
  ["CO", "보고타", "Bogotá", 4.71, -74.07, "America/Bogota", C],
  ["CR", "산호세", "San José", 9.93, -84.08, "America/Costa_Rica", C],
  ["CU", "아바나", "Havana", 23.11, -82.37, "America/Havana", C],
  ["DM", "로조", "Roseau", 15.3, -61.39, "America/Dominica", C],
  ["DO", "산토도밍고", "Santo Domingo", 18.49, -69.93, "America/Santo_Domingo", C],
  ["EC", "키토", "Quito", -0.18, -78.47, "America/Guayaquil", C],
  ["SV", "산살바도르", "San Salvador", 13.69, -89.22, "America/El_Salvador", C],
  ["GD", "세인트조지스", "St. George's", 12.06, -61.75, "America/Grenada", C],
  ["GT", "과테말라시티", "Guatemala City", 14.63, -90.51, "America/Guatemala", C],
  ["GY", "조지타운", "Georgetown", 6.8, -58.16, "America/Guyana", C],
  ["HT", "포르토프랭스", "Port-au-Prince", 18.59, -72.31, "America/Port-au-Prince", C],
  ["HN", "테구시갈파", "Tegucigalpa", 14.07, -87.19, "America/Tegucigalpa", C],
  ["JM", "킹스턴", "Kingston", 17.97, -76.79, "America/Jamaica", C],
  ["MX", "멕시코시티", "Mexico City", 19.43, -99.13, "America/Mexico_City", C],
  ["MX", "칸쿤", "Cancún", 21.16, -86.85, "America/Cancun", M],
  ["NI", "마나과", "Managua", 12.11, -86.24, "America/Managua", C],
  ["PA", "파나마시티", "Panama City", 8.98, -79.52, "America/Panama", C],
  ["PY", "아순시온", "Asunción", -25.26, -57.58, "America/Asuncion", C],
  ["PE", "리마", "Lima", -12.05, -77.04, "America/Lima", C],
  ["KN", "바스테르", "Basseterre", 17.3, -62.72, "America/St_Kitts", C],
  ["LC", "캐스트리스", "Castries", 14.01, -60.99, "America/St_Lucia", C],
  ["VC", "킹스타운", "Kingstown", 13.16, -61.22, "America/St_Vincent", C],
  ["SR", "파라마리보", "Paramaribo", 5.85, -55.2, "America/Paramaribo", C],
  ["TT", "포트오브스페인", "Port of Spain", 10.65, -61.51, "America/Port_of_Spain", C],
  ["UY", "몬테비데오", "Montevideo", -34.9, -56.16, "America/Montevideo", C],
  ["VE", "카라카스", "Caracas", 10.48, -66.9, "America/Caracas", C],
  // Asia
  ["AF", "카불", "Kabul", 34.56, 69.21, "Asia/Kabul", C],
  ["AM", "예레반", "Yerevan", 40.18, 44.51, "Asia/Yerevan", C],
  ["AZ", "바쿠", "Baku", 40.41, 49.87, "Asia/Baku", C],
  ["BH", "마나마", "Manama", 26.23, 50.59, "Asia/Bahrain", C],
  ["BD", "다카", "Dhaka", 23.81, 90.41, "Asia/Dhaka", C],
  ["BT", "팀부", "Thimphu", 27.47, 89.64, "Asia/Thimphu", C],
  ["BN", "반다르스리브가완", "Bandar Seri Begawan", 4.9, 114.94, "Asia/Brunei", C],
  ["KH", "프놈펜", "Phnom Penh", 11.56, 104.93, "Asia/Phnom_Penh", C],
  ["CN", "베이징", "Beijing", 39.9, 116.41, "Asia/Shanghai", C],
  ["CN", "상하이", "Shanghai", 31.23, 121.47, "Asia/Shanghai", M],
  ["CN", "홍콩", "Hong Kong", 22.32, 114.17, "Asia/Hong_Kong", M],
  ["CN", "광저우", "Guangzhou", 23.13, 113.26, "Asia/Shanghai", M],
  ["CN", "청두", "Chengdu", 30.57, 104.07, "Asia/Shanghai", M],
  ["CY", "니코시아", "Nicosia", 35.19, 33.38, "Asia/Nicosia", C],
  ["GE", "트빌리시", "Tbilisi", 41.72, 44.78, "Asia/Tbilisi", C],
  ["IN", "뉴델리", "New Delhi", 28.61, 77.21, "Asia/Kolkata", C],
  ["IN", "뭄바이", "Mumbai", 19.08, 72.88, "Asia/Kolkata", M],
  ["IN", "벵갈루루", "Bengaluru", 12.97, 77.59, "Asia/Kolkata", M],
  ["ID", "자카르타", "Jakarta", -6.21, 106.85, "Asia/Jakarta", C],
  ["ID", "덴파사르", "Denpasar", -8.65, 115.22, "Asia/Makassar", M],
  ["IR", "테헤란", "Tehran", 35.69, 51.39, "Asia/Tehran", C],
  ["IQ", "바그다드", "Baghdad", 33.32, 44.36, "Asia/Baghdad", C],
  ["IL", "예루살렘", "Jerusalem", 31.77, 35.21, "Asia/Jerusalem", C],
  ["IL", "텔아비브", "Tel Aviv", 32.09, 34.78, "Asia/Jerusalem", M],
  ["JP", "도쿄", "Tokyo", 35.68, 139.69, "Asia/Tokyo", C],
  ["JP", "오사카", "Osaka", 34.69, 135.5, "Asia/Tokyo", M],
  ["JP", "교토", "Kyoto", 35.01, 135.77, "Asia/Tokyo", M],
  ["JP", "삿포로", "Sapporo", 43.06, 141.35, "Asia/Tokyo", M],
  ["JP", "후쿠오카", "Fukuoka", 33.59, 130.4, "Asia/Tokyo", M],
  ["JO", "암만", "Amman", 31.95, 35.93, "Asia/Amman", C],
  ["KZ", "아스타나", "Astana", 51.17, 71.45, "Asia/Almaty", C],
  ["KZ", "알마티", "Almaty", 43.24, 76.95, "Asia/Almaty", M],
  ["KW", "쿠웨이트시티", "Kuwait City", 29.38, 47.99, "Asia/Kuwait", C],
  ["KG", "비슈케크", "Bishkek", 42.87, 74.59, "Asia/Bishkek", C],
  ["LA", "비엔티안", "Vientiane", 17.98, 102.63, "Asia/Vientiane", C],
  ["LB", "베이루트", "Beirut", 33.89, 35.5, "Asia/Beirut", C],
  ["MY", "쿠알라룸푸르", "Kuala Lumpur", 3.14, 101.69, "Asia/Kuala_Lumpur", C],
  ["MV", "말레", "Malé", 4.18, 73.51, "Indian/Maldives", C],
  ["MN", "울란바토르", "Ulaanbaatar", 47.89, 106.91, "Asia/Ulaanbaatar", C],
  ["MM", "네피도", "Naypyidaw", 19.76, 96.08, "Asia/Yangon", C],
  ["NP", "카트만두", "Kathmandu", 27.72, 85.32, "Asia/Kathmandu", C],
  ["KP", "평양", "Pyongyang", 39.04, 125.76, "Asia/Pyongyang", C],
  ["OM", "무스카트", "Muscat", 23.59, 58.41, "Asia/Muscat", C],
  ["PK", "이슬라마바드", "Islamabad", 33.68, 73.05, "Asia/Karachi", C],
  ["PK", "카라치", "Karachi", 24.86, 67.01, "Asia/Karachi", M],
  ["PS", "라말라", "Ramallah", 31.9, 35.2, "Asia/Hebron", C],
  ["PH", "마닐라", "Manila", 14.6, 120.98, "Asia/Manila", C],
  ["PH", "세부", "Cebu", 10.32, 123.89, "Asia/Manila", M],
  ["QA", "도하", "Doha", 25.29, 51.53, "Asia/Qatar", C],
  ["SA", "리야드", "Riyadh", 24.71, 46.68, "Asia/Riyadh", C],
  ["SA", "제다", "Jeddah", 21.49, 39.19, "Asia/Riyadh", M],
  ["SG", "싱가포르", "Singapore", 1.35, 103.82, "Asia/Singapore", C],
  ["KR", "서울", "Seoul", 37.57, 126.98, "Asia/Seoul", C],
  ["KR", "부산", "Busan", 35.18, 129.08, "Asia/Seoul", M],
  ["KR", "인천", "Incheon", 37.46, 126.71, "Asia/Seoul", M],
  ["KR", "대구", "Daegu", 35.87, 128.6, "Asia/Seoul", M],
  ["KR", "대전", "Daejeon", 36.35, 127.38, "Asia/Seoul", M],
  ["KR", "광주", "Gwangju", 35.16, 126.85, "Asia/Seoul", M],
  ["KR", "제주", "Jeju", 33.5, 126.53, "Asia/Seoul", M],
  ["LK", "스리자야와르데네푸라코테", "Sri Jayawardenepura Kotte", 6.89, 79.92, "Asia/Colombo", C],
  ["LK", "콜롬보", "Colombo", 6.93, 79.86, "Asia/Colombo", M],
  ["SY", "다마스쿠스", "Damascus", 33.51, 36.28, "Asia/Damascus", C],
  ["TW", "타이베이", "Taipei", 25.03, 121.57, "Asia/Taipei", C],
  ["TJ", "두샨베", "Dushanbe", 38.56, 68.79, "Asia/Dushanbe", C],
  ["TH", "방콕", "Bangkok", 13.76, 100.5, "Asia/Bangkok", C],
  ["TH", "치앙마이", "Chiang Mai", 18.79, 98.98, "Asia/Bangkok", M],
  ["TL", "딜리", "Dili", -8.56, 125.57, "Asia/Dili", C],
  ["TR", "앙카라", "Ankara", 39.93, 32.86, "Europe/Istanbul", C],
  ["TR", "이스탄불", "Istanbul", 41.01, 28.98, "Europe/Istanbul", M],
  ["TM", "아시가바트", "Ashgabat", 37.96, 58.33, "Asia/Ashgabat", C],
  ["AE", "아부다비", "Abu Dhabi", 24.45, 54.38, "Asia/Dubai", C],
  ["AE", "두바이", "Dubai", 25.2, 55.27, "Asia/Dubai", M],
  ["UZ", "타슈켄트", "Tashkent", 41.3, 69.24, "Asia/Tashkent", C],
  ["VN", "하노이", "Hanoi", 21.03, 105.85, "Asia/Ho_Chi_Minh", C],
  ["VN", "호찌민", "Ho Chi Minh City", 10.82, 106.63, "Asia/Ho_Chi_Minh", M],
  ["YE", "사나", "Sana'a", 15.37, 44.19, "Asia/Aden", C],
  // Europe
  ["AL", "티라나", "Tirana", 41.33, 19.82, "Europe/Tirane", C],
  ["AD", "안도라라베야", "Andorra la Vella", 42.51, 1.52, "Europe/Andorra", C],
  ["AT", "빈", "Vienna", 48.21, 16.37, "Europe/Vienna", C],
  ["BY", "민스크", "Minsk", 53.9, 27.56, "Europe/Minsk", C],
  ["BE", "브뤼셀", "Brussels", 50.85, 4.35, "Europe/Brussels", C],
  ["BA", "사라예보", "Sarajevo", 43.86, 18.41, "Europe/Sarajevo", C],
  ["BG", "소피아", "Sofia", 42.7, 23.32, "Europe/Sofia", C],
  ["HR", "자그레브", "Zagreb", 45.81, 15.98, "Europe/Zagreb", C],
  ["CZ", "프라하", "Prague", 50.08, 14.44, "Europe/Prague", C],
  ["DK", "코펜하겐", "Copenhagen", 55.68, 12.57, "Europe/Copenhagen", C],
  ["DK", "누크", "Nuuk", 64.18, -51.72, "America/Nuuk", M],
  ["EE", "탈린", "Tallinn", 59.44, 24.75, "Europe/Tallinn", C],
  ["FI", "헬싱키", "Helsinki", 60.17, 24.94, "Europe/Helsinki", C],
  ["FI", "로바니에미", "Rovaniemi", 66.5, 25.73, "Europe/Helsinki", M],
  ["FR", "파리", "Paris", 48.86, 2.35, "Europe/Paris", C],
  ["FR", "마르세유", "Marseille", 43.3, 5.37, "Europe/Paris", M],
  ["DE", "베를린", "Berlin", 52.52, 13.4, "Europe/Berlin", C],
  ["DE", "뮌헨", "Munich", 48.14, 11.58, "Europe/Berlin", M],
  ["DE", "함부르크", "Hamburg", 53.55, 9.99, "Europe/Berlin", M],
  ["GR", "아테네", "Athens", 37.98, 23.73, "Europe/Athens", C],
  ["HU", "부다페스트", "Budapest", 47.5, 19.04, "Europe/Budapest", C],
  ["IS", "레이캬비크", "Reykjavík", 64.15, -21.94, "Atlantic/Reykjavik", C],
  ["IE", "더블린", "Dublin", 53.35, -6.26, "Europe/Dublin", C],
  ["IT", "로마", "Rome", 41.9, 12.5, "Europe/Rome", C],
  ["IT", "밀라노", "Milan", 45.46, 9.19, "Europe/Rome", M],
  ["XK", "프리슈티나", "Pristina", 42.66, 21.17, "Europe/Belgrade", C],
  ["LV", "리가", "Riga", 56.95, 24.11, "Europe/Riga", C],
  ["LI", "파두츠", "Vaduz", 47.14, 9.52, "Europe/Vaduz", C],
  ["LT", "빌뉴스", "Vilnius", 54.69, 25.28, "Europe/Vilnius", C],
  ["LU", "룩셈부르크", "Luxembourg", 49.61, 6.13, "Europe/Luxembourg", C],
  ["MT", "발레타", "Valletta", 35.9, 14.51, "Europe/Malta", C],
  ["MD", "키시너우", "Chișinău", 47.01, 28.86, "Europe/Chisinau", C],
  ["MC", "모나코", "Monaco", 43.74, 7.42, "Europe/Monaco", C],
  ["ME", "포드고리차", "Podgorica", 42.43, 19.26, "Europe/Podgorica", C],
  ["NL", "암스테르담", "Amsterdam", 52.37, 4.9, "Europe/Amsterdam", C],
  ["MK", "스코페", "Skopje", 42.0, 21.43, "Europe/Skopje", C],
  ["NO", "오슬로", "Oslo", 59.91, 10.75, "Europe/Oslo", C],
  ["NO", "트롬쇠", "Tromsø", 69.65, 18.96, "Europe/Oslo", M],
  ["NO", "롱위에아르뷔엔", "Longyearbyen", 78.22, 15.65, "Arctic/Longyearbyen", M],
  ["PL", "바르샤바", "Warsaw", 52.23, 21.01, "Europe/Warsaw", C],
  ["PT", "리스본", "Lisbon", 38.72, -9.14, "Europe/Lisbon", C],
  ["RO", "부쿠레슈티", "Bucharest", 44.43, 26.1, "Europe/Bucharest", C],
  ["RU", "모스크바", "Moscow", 55.76, 37.62, "Europe/Moscow", C],
  ["RU", "상트페테르부르크", "Saint Petersburg", 59.94, 30.31, "Europe/Moscow", M],
  ["RU", "무르만스크", "Murmansk", 68.97, 33.08, "Europe/Moscow", M],
  ["RU", "노보시비르스크", "Novosibirsk", 55.01, 82.93, "Asia/Novosibirsk", M],
  ["RU", "블라디보스토크", "Vladivostok", 43.12, 131.89, "Asia/Vladivostok", M],
  ["SM", "산마리노", "San Marino", 43.94, 12.45, "Europe/San_Marino", C],
  ["RS", "베오그라드", "Belgrade", 44.79, 20.45, "Europe/Belgrade", C],
  ["SK", "브라티슬라바", "Bratislava", 48.15, 17.11, "Europe/Bratislava", C],
  ["SI", "류블랴나", "Ljubljana", 46.06, 14.51, "Europe/Ljubljana", C],
  ["ES", "마드리드", "Madrid", 40.42, -3.7, "Europe/Madrid", C],
  ["ES", "바르셀로나", "Barcelona", 41.39, 2.17, "Europe/Madrid", M],
  ["SE", "스톡홀름", "Stockholm", 59.33, 18.07, "Europe/Stockholm", C],
  ["CH", "베른", "Bern", 46.95, 7.45, "Europe/Zurich", C],
  ["CH", "취리히", "Zurich", 47.37, 8.54, "Europe/Zurich", M],
  ["CH", "제네바", "Geneva", 46.2, 6.14, "Europe/Zurich", M],
  ["UA", "키이우", "Kyiv", 50.45, 30.52, "Europe/Kyiv", C],
  ["GB", "런던", "London", 51.51, -0.13, "Europe/London", C],
  ["GB", "에든버러", "Edinburgh", 55.95, -3.19, "Europe/London", M],
  ["GB", "맨체스터", "Manchester", 53.48, -2.24, "Europe/London", M],
  ["VA", "바티칸", "Vatican City", 41.9, 12.45, "Europe/Vatican", C],
  // Oceania
  ["AU", "캔버라", "Canberra", -35.28, 149.13, "Australia/Sydney", C],
  ["AU", "시드니", "Sydney", -33.87, 151.21, "Australia/Sydney", M],
  ["AU", "멜버른", "Melbourne", -37.81, 144.96, "Australia/Melbourne", M],
  ["AU", "퍼스", "Perth", -31.95, 115.86, "Australia/Perth", M],
  ["FJ", "수바", "Suva", -18.14, 178.44, "Pacific/Fiji", C],
  ["KI", "타라와", "South Tarawa", 1.45, 173.03, "Pacific/Tarawa", C],
  ["MH", "마주로", "Majuro", 7.09, 171.38, "Pacific/Majuro", C],
  ["FM", "팔리키르", "Palikir", 6.92, 158.16, "Pacific/Pohnpei", C],
  ["NR", "야렌", "Yaren", -0.55, 166.92, "Pacific/Nauru", C],
  ["NZ", "웰링턴", "Wellington", -41.29, 174.78, "Pacific/Auckland", C],
  ["NZ", "오클랜드", "Auckland", -36.85, 174.76, "Pacific/Auckland", M],
  ["PW", "응게룰무드", "Ngerulmud", 7.5, 134.62, "Pacific/Palau", C],
  ["PG", "포트모르즈비", "Port Moresby", -9.44, 147.18, "Pacific/Port_Moresby", C],
  ["WS", "아피아", "Apia", -13.83, -171.76, "Pacific/Apia", C],
  ["SB", "호니아라", "Honiara", -9.43, 159.95, "Pacific/Guadalcanal", C],
  ["TO", "누쿠알로파", "Nuku'alofa", -21.14, -175.2, "Pacific/Tongatapu", C],
  ["TV", "푸나푸티", "Funafuti", -8.52, 179.2, "Pacific/Funafuti", C],
  ["VU", "포트빌라", "Port Vila", -17.73, 168.32, "Pacific/Efate", C],
];

const slug = (s) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const countryByCode = new Map(COUNTRIES.map(([code, ko, en]) => [code, { code, ko, en }]));
const stateByCode = new Map(US_STATES.map(([code, ko, en]) => [code, { code, ko, en }]));

function build() {
  const out = [];
  for (const [state, ko, en, lat, lon, tz] of US_ROWS) {
    out.push({
      id: `us-${state.toLowerCase()}-${slug(en)}`,
      name: ko,
      nameEn: en,
      country: "US",
      state,
      lat,
      lon,
      tz,
      kind: "state",
    });
  }
  for (const [country, ko, en, lat, lon, tz, kind] of WORLD_ROWS) {
    out.push({ id: `${country.toLowerCase()}-${slug(en)}`, name: ko, nameEn: en, country, state: null, lat, lon, tz, kind });
  }
  return out;
}

export const CITIES = build();
const byId = new Map(CITIES.map((c) => [c.id, c]));

export const cityById = (id) => byId.get(id) || null;
export const countryOf = (city) => countryByCode.get(city.country);
export const stateOf = (city) => (city.state ? stateByCode.get(city.state) : null);
export const citiesIn = (country) => CITIES.filter((c) => c.country === country);

// English display: "Seattle · Washington · United States", "Seoul · South Korea".
export function placeLabel(city) {
  const country = countryOf(city);
  const state = stateOf(city);
  return { city: city.nameEn, region: state ? state.en : "", country: country ? country.en : city.country };
}

const norm = (s) => s.normalize("NFC").toLowerCase().replace(/\s+/g, "");

export function searchCities(query, limit = 20) {
  const q = norm(String(query || ""));
  if (!q) return [];
  const scored = [];
  for (const c of CITIES) {
    const country = countryOf(c);
    const state = stateOf(c);
    const names = [c.name, c.nameEn, country?.ko, country?.en, state?.ko, state?.en].filter(Boolean).map(norm);
    let score = -1;
    if (names[0] === q || names[1] === q) score = 0;
    else if (names[0].startsWith(q) || names[1].startsWith(q)) score = 1;
    else if (names[0].includes(q) || names[1].includes(q)) score = 2;
    else if (names.slice(2).some((n) => n.startsWith(q))) score = 3;
    if (score >= 0) scored.push({ c, score });
  }
  scored.sort((a, b) => a.score - b.score || (a.c.kind === "capital" ? -1 : 0) - (b.c.kind === "capital" ? -1 : 0));
  return scored.slice(0, limit).map((s) => s.c);
}

export function distanceKm(aLat, aLon, bLat, bLon) {
  const r = Math.PI / 180;
  const dLat = (bLat - aLat) * r;
  const dLon = (bLon - aLon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export function nearestCity(lat, lon) {
  let best = null;
  for (const c of CITIES) {
    const d = distanceKm(lat, lon, c.lat, c.lon);
    if (!best || d < best.km) best = { city: c, km: d };
  }
  return best;
}

// Countries that have at least one city, sorted by English name.
export function countryList() {
  const codes = new Set(CITIES.map((c) => c.country));
  return COUNTRIES.filter(([code]) => codes.has(code))
    .map(([code, ko, en]) => ({ code, ko, en, count: CITIES.filter((c) => c.country === code).length }))
    .sort((a, b) => a.en.localeCompare(b.en, "en"));
}
