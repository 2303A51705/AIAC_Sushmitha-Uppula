#generate a python programm to check whether a given year is leap year 
def is_leap_year(year):
    if (year % 4 == 0 and year % 100 != 0) or (year % 400 == 0):
        print("leaf year")
    else:
        print("not leaf year")
year=int(input("enter year:"))
is_leap_year(year)

#one shot prompting
'''
n1=12, n2=18
display greatest common divisor of n1 and n2'''
def gcd(n1, n2):
    while n2:
        n1, n2 = n2, n1 % n2
    return n1
n1 = 12
n2 =18
print("GCD of", n1, "and", n2, "is", gcd(n1, n2))

#few shot prompting
'''
input 1:4,6 
input 2:5,10
input 3:7,3
display least common multiple of input1, input2 and input3'''
def lcm(a, b):
    def gcd(x, y):
        while y:
            x, y = y, x % y
        return x
    return a * b // gcd(a, b)
inputs = [(4, 6), (5, 10), (7, 3)]
for a, b in inputs:
    print(f"LCM of {a} and {b} is {lcm(a, b)}")

#zero short prompting
#write a python programm that converts a binary number to decimal if the input is invalid binary return invalid binary and if conversion is not possible print conversion is not possible


def binary_to_decimal(binary_str):
    try:
        if not all(char in '01' for char in binary_str):
            return "invalid binary"
        decimal_value = int(binary_str, 2)
        return decimal_value
    except ValueError:
        return "conversion is not possible"
binary_input = input("Enter a binary number: ")
result = binary_to_decimal(binary_input)
print("Result:", result)



    







