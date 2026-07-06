#define S1_PIN A2
#define S2_PIN A3
#define S3_PIN A4
#define Ultra_PIN A5

void setup() 
{
  Serial.begin(9600);
}

void loop()
{
  Serial.println(analogRead(S1_PIN));
   Serial.println(analogRead(S2_PIN));
    Serial.println(analogRead(S3_PIN));
     Serial.println(analogRead(Ultra_PIN));

  delay(2000);
}